$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name, [string]$InstallHint)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Error "Required command '$Name' not found. $InstallHint"
  }
}

Require-Command -Name aws -InstallHint "Install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"

# -------- Input prompts --------
$AwsAccessKeyId = Read-Host "AWS Access Key ID"
$AwsSecretAccessKey = Read-Host "AWS Secret Access Key" -AsSecureString
$AwsRegion = Read-Host "AWS Region (e.g., ap-south-1)"
if ([string]::IsNullOrWhiteSpace($AwsRegion)) { $AwsRegion = "ap-south-1" }

$GitHubOwner = Read-Host "GitHub owner/org (e.g., your-username-or-org)"
$GitHubRepo = Read-Host "GitHub repository name (e.g., your-repo)"
$BranchRef = Read-Host "Git branch to allow (refs/heads/main). Leave empty to use refs/heads/main"
if ([string]::IsNullOrWhiteSpace($BranchRef)) { $BranchRef = "refs/heads/main" }

$BaseName = Read-Host "Base name for ECS resources (e.g., police-fine). Leave empty to use police-fine"
if ([string]::IsNullOrWhiteSpace($BaseName)) { $BaseName = "police-fine" }

$UsePrivateGhcr = Read-Host "Are your GHCR images private? (Y/N)"
$GitHubPAT = $null
if ($UsePrivateGhcr -match '^(Y|y)') {
  $GitHubPAT = Read-Host "GitHub Personal Access Token (read:packages)" -AsSecureString
}

# -------- Configure AWS CLI credentials (session-local default profile) --------
aws configure set aws_access_key_id $AwsAccessKeyId --profile default | Out-Null
$skBSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AwsSecretAccessKey)
$AwsSecretAccessKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($skBSTR)
aws configure set aws_secret_access_key $AwsSecretAccessKeyPlain --profile default | Out-Null
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($skBSTR)
aws configure set region $AwsRegion --profile default | Out-Null

# -------- Discover AWS account and default VPC/subnets --------
$Caller = aws sts get-caller-identity | ConvertFrom-Json
$AccountId = $Caller.Account

# Ensure default VPC exists; try create if missing
$Vpc = aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" | ConvertFrom-Json
if (-not $Vpc.Vpcs -or $Vpc.Vpcs.Count -eq 0) {
  Write-Host "No default VPC found. Attempting to create one..."
  $createdDefaultVpcJson = aws ec2 create-default-vpc 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($createdDefaultVpcJson)) {
    throw "No default VPC and creation failed. Create a VPC (with ≥2 subnets) then re-run."
  }
  $Vpc = aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" | ConvertFrom-Json
}
$VpcId = $Vpc.Vpcs[0].VpcId

$SubnetsAll = aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VpcId" | ConvertFrom-Json
$SubnetIds = @()
foreach ($s in $SubnetsAll.Subnets) { $SubnetIds += $s.SubnetId }
if ($SubnetIds.Count -lt 2) { throw "Need at least two subnets in the VPC. Found $($SubnetIds.Count)." }
$SubnetA = $SubnetIds[0]
$SubnetB = $SubnetIds[1]

# -------- Create Security Groups --------
$AlbSgName = "$BaseName-alb-sg"
$SvcSgName = "$BaseName-svc-sg"

function Ensure-SG {
  param([string]$Name, [string]$Desc)
  $existing = aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$VpcId" "Name=group-name,Values=$Name" | ConvertFrom-Json
  if ($existing.SecurityGroups -and $existing.SecurityGroups.Count -gt 0) { return $existing.SecurityGroups[0].GroupId }
  $created = aws ec2 create-security-group --group-name $Name --description $Desc --vpc-id $VpcId | ConvertFrom-Json
  return $created.GroupId
}
function Try-Authorize {
  param([string]$SgId, [string]$Cidr, [int]$Port, [string]$Proto = "tcp")
  try { aws ec2 authorize-security-group-ingress --group-id $SgId --protocol $Proto --port $Port --cidr $Cidr | Out-Null } catch { }
}
function Try-Authorize-FromSG {
  param([string]$SgId, [string]$SourceSgId, [int]$Port, [string]$Proto = "tcp")
  try { aws ec2 authorize-security-group-ingress --group-id $SgId --protocol $Proto --port $Port --source-group $SourceSgId | Out-Null } catch { }
}

$AlbSgId = Ensure-SG -Name $AlbSgName -Desc "ALB SG for $BaseName"
$SvcSgId = Ensure-SG -Name $SvcSgName -Desc "Service SG for $BaseName"
Try-Authorize -SgId $AlbSgId -Cidr "0.0.0.0/0" -Port 80
Try-Authorize-FromSG -SgId $SvcSgId -SourceSgId $AlbSgId -Port 80
Try-Authorize-FromSG -SgId $SvcSgId -SourceSgId $AlbSgId -Port 5000

# -------- IAM: OIDC provider for GitHub Actions --------
$OidcUrl = "https://token.actions.githubusercontent.com"
$HasProvider = $false
$OidcList = aws iam list-open-id-connect-providers | ConvertFrom-Json
foreach ($p in $OidcList.OpenIDConnectProviderList) { if ($p.Arn -like "*token.actions.githubusercontent.com*") { $HasProvider = $true } }
if (-not $HasProvider) {
  $Thumbprint = "6938fd4d98bab03faadb97b34396831e3780aea1"
  aws iam create-open-id-connect-provider --url $OidcUrl --client-id-list "sts.amazonaws.com" --thumbprint-list $Thumbprint | Out-Null
}

# -------- IAM: ECS task execution role --------
$TaskExecRoleName = "ecsTaskExecutionRole"
$TaskExecRoleArn = $null
try {
  $role = aws iam get-role --role-name $TaskExecRoleName | ConvertFrom-Json
  $TaskExecRoleArn = $role.Role.Arn
} catch {
  $TrustEcs = @{
    Version = "2012-10-17"
    Statement = @(@{ Effect = "Allow"; Principal = @{ Service = "ecs-tasks.amazonaws.com" }; Action = "sts:AssumeRole" })
  } | ConvertTo-Json -Depth 5
  $role = aws iam create-role --role-name $TaskExecRoleName --assume-role-policy-document $TrustEcs | ConvertFrom-Json
  $TaskExecRoleArn = $role.Role.Arn
  aws iam attach-role-policy --role-name $TaskExecRoleName --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy | Out-Null
}
if ($UsePrivateGhcr -match '^(Y|y)') {
  try { aws iam attach-role-policy --role-name $TaskExecRoleName --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite | Out-Null } catch { }
}

# -------- IAM: GitHub OIDC role for deployments --------
$GhOidcRoleName = "GitHubActionsECSDeployRole"
$GhOidcRoleArn = $null
$SubCondition = "repo:$GitHubOwner/$GitHubRepo:ref:$BranchRef"
$TrustPolicy = @{
  Version = "2012-10-17"
  Statement = @(@{
    Effect = "Allow"
    Principal = @{ Federated = "arn:aws:iam::$AccountId:oidc-provider/token.actions.githubusercontent.com" }
    Action = "sts:AssumeRoleWithWebIdentity"
    Condition = @{
      "StringEquals" = @{ "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
      "StringLike" = @{ "token.actions.githubusercontent.com:sub" = $SubCondition }
    }
  })
} | ConvertTo-Json -Depth 10

try {
  $role = aws iam get-role --role-name $GhOidcRoleName | ConvertFrom-Json
  $GhOidcRoleArn = $role.Role.Arn
} catch {
  $role = aws iam create-role --role-name $GhOidcRoleName --assume-role-policy-document $TrustPolicy | ConvertFrom-Json
  $GhOidcRoleArn = $role.Role.Arn
}
$DeployPolicyName = "GitHubEcsDeployPolicy"
$DeployPolicyDoc = @{
  Version = "2012-10-17"
  Statement = @(
    @{ Effect = "Allow"; Action = @("ecs:UpdateService","ecs:DescribeServices","ecs:DescribeClusters","ecs:DescribeTaskDefinition","ecs:ListServices"); Resource = "*" },
    @{ Effect = "Allow"; Action = "iam:PassRole"; Resource = $TaskExecRoleArn }
  )
} | ConvertTo-Json -Depth 10
aws iam put-role-policy --role-name $GhOidcRoleName --policy-name $DeployPolicyName --policy-document $DeployPolicyDoc | Out-Null

# -------- Optional: store GHCR PAT for private pulls --------
$RepoCredsSecretArn = $null
if ($UsePrivateGhcr -match '^(Y|y)') {
  $patBSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($GitHubPAT)
  $GitHubPATPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($patBSTR)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($patBSTR)

  $SecretName = "$BaseName-ghcr-pat"
  $filters = "[{`"Key`":`"name`",`"Values`":[`"$SecretName`"]}]"
  $existing = aws secretsmanager list-secrets --filters $filters | ConvertFrom-Json
  if ($existing.SecretList -and $existing.SecretList.Count -gt 0) {
    $RepoCredsSecretArn = $existing.SecretList[0].ARN
    aws secretsmanager update-secret --secret-id $RepoCredsSecretArn --secret-string $GitHubPATPlain | Out-Null
  } else {
    $created = aws secretsmanager create-secret --name $SecretName --secret-string $GitHubPATPlain | ConvertFrom-Json
    $RepoCredsSecretArn = $created.ARN
  }
}

# -------- ALB + Target Groups + Listener/Rule (with fallback) --------
$UseAlb = $true
$AlbName = "$BaseName-alb"
$AlbArn = $null
$AlbDns = $null

# Check existing
$AlbList = aws elbv2 describe-load-balancers 2>$null | ConvertFrom-Json
if ($LASTEXITCODE -eq 0 -and $AlbList.LoadBalancers) {
  foreach ($lb in $AlbList.LoadBalancers) {
    if ($lb.LoadBalancerName -eq $AlbName) { $AlbArn = $lb.LoadBalancerArn; $AlbDns = $lb.DNSName }
  }
}

if (-not $AlbArn) {
  $albCreateJson = aws elbv2 create-load-balancer --name $AlbName --type application --security-groups $AlbSgId --subnets $SubnetA $SubnetB 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($albCreateJson)) {
    Write-Warning "ALB creation failed or not permitted in this account/region. Falling back to no-ALB mode."
    $UseAlb = $false
  } else {
    $created = $albCreateJson | ConvertFrom-Json
    $AlbArn = $created.LoadBalancers[0].LoadBalancerArn
    $AlbDns = $created.LoadBalancers[0].DNSName
  }
}

$TgFrontendArn = $null
$TgBackendArn = $null

function Ensure-TG {
  param([string]$Name, [int]$Port, [string]$HealthPath)
  $tgsJson = aws elbv2 describe-target-groups --names $Name 2>$null
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($tgsJson)) {
    $tgs = $tgsJson | ConvertFrom-Json
    if ($tgs.TargetGroups -and $tgs.TargetGroups.Count -gt 0) { return $tgs.TargetGroups[0].TargetGroupArn }
  }
  $tg = aws elbv2 create-target-group --name $Name --protocol HTTP --port $Port --vpc-id $VpcId --target-type ip --health-check-path $HealthPath | ConvertFrom-Json
  return $tg.TargetGroups[0].TargetGroupArn
}

if ($UseAlb) {
  $TgFrontendArn = Ensure-TG -Name "$BaseName-frontend-tg" -Port 80   -HealthPath "/"
  $TgBackendArn  = Ensure-TG -Name "$BaseName-backend-tg"  -Port 5000 -HealthPath "/health"

  if (-not $TgFrontendArn) { throw "Frontend TG ARN is empty" }
  if (-not $TgBackendArn)  { throw "Backend TG ARN is empty" }

  $Listeners = aws elbv2 describe-listeners --load-balancer-arn $AlbArn 2>$null | ConvertFrom-Json
  $ListenerArn = $null
  if ($LASTEXITCODE -eq 0 -and $Listeners.Listeners) {
    foreach ($l in $Listeners.Listeners) { if ($l.Port -eq 80) { $ListenerArn = $l.ListenerArn } }
  }
  $defaultActions = @(@{ Type = "forward"; TargetGroupArn = $TgFrontendArn }) | ConvertTo-Json -Compress
  if (-not $ListenerArn) {
    $createListenerJson = aws elbv2 create-listener --load-balancer-arn $AlbArn --protocol HTTP --port 80 --default-actions $defaultActions 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($createListenerJson)) {
      throw "Failed to create listener. Check ELB permissions."
    }
    $createdL = $createListenerJson | ConvertFrom-Json
    $ListenerArn = $createdL.Listeners[0].ListenerArn
  } else {
    aws elbv2 modify-listener --listener-arn $ListenerArn --default-actions $defaultActions | Out-Null
  }

  $Rules = aws elbv2 describe-rules --listener-arn $ListenerArn | ConvertFrom-Json
  $HasApiRule = $false
  foreach ($r in $Rules.Rules) {
    foreach ($c in $r.Conditions) {
      if ($c.Field -eq "path-pattern" -and ($c.Values -contains "/api*")) { $HasApiRule = $true }
    }
  }
  if (-not $HasApiRule) {
    $conditions = @(@{ Field = "path-pattern"; Values = @("/api*") }) | ConvertTo-Json -Compress
    $actions    = @(@{ Type = "forward"; TargetGroupArn = $TgBackendArn }) | ConvertTo-Json -Compress
    aws elbv2 create-rule --listener-arn $ListenerArn --priority 10 --conditions $conditions --actions $actions | Out-Null
  }
}

# -------- CloudWatch Log Groups --------
function Ensure-LogGroup {
  param([string]$Name)
  try { aws logs create-log-group --log-group-name $Name | Out-Null } catch { }
}
$LgFrontend = "/ecs/$BaseName-frontend"
$LgBackend = "/ecs/$BaseName-backend"
Ensure-LogGroup -Name $LgFrontend
Ensure-LogGroup -Name $LgBackend

# -------- ECS Cluster --------
$ClusterName = "$BaseName-cluster"
$descClustersJson = aws ecs describe-clusters --clusters $ClusterName 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($descClustersJson)) {
  aws ecs create-cluster --cluster-name $ClusterName | Out-Null
}

# -------- Task Definitions --------
$OwnerLower = $GitHubOwner.ToLower()
$RepoLower = $GitHubRepo.ToLower()
$FrontendImage = "ghcr.io/$OwnerLower/$RepoLower-frontend:latest"
$BackendImage  = "ghcr.io/$OwnerLower/$RepoLower-backend:latest"

$RepoCredsBlock = $null
if ($UsePrivateGhcr -match '^(Y|y)' -and $RepoCredsSecretArn) {
  $RepoCredsBlock = @{ credentialsParameter = $RepoCredsSecretArn }
}

$TdFrontend = @{
  family = "$BaseName-frontend"
  networkMode = "awsvpc"
  requiresCompatibilities = @("FARGATE")
  cpu = "512"
  memory = "1024"
  executionRoleArn = $TaskExecRoleArn
  containerDefinitions = @(@{
    name = "frontend"
    image = $FrontendImage
    portMappings = @(@{ containerPort = 80; protocol = "tcp" })
    logConfiguration = @{
      logDriver = "awslogs"
      options = @{
        "awslogs-group" = $LgFrontend
        "awslogs-region" = $AwsRegion
        "awslogs-stream-prefix" = "ecs"
      }
    }
    repositoryCredentials = $RepoCredsBlock
  })
} | ConvertTo-Json -Depth 20

$TdBackend = @{
  family = "$BaseName-backend"
  networkMode = "awsvpc"
  requiresCompatibilities = @("FARGATE")
  cpu = "512"
  memory = "1024"
  executionRoleArn = $TaskExecRoleArn
  containerDefinitions = @(@{
    name = "backend"
    image = $BackendImage
    portMappings = @(@{ containerPort = 5000; protocol = "tcp" })
    logConfiguration = @{
      logDriver = "awslogs"
      options = @{
        "awslogs-group" = $LgBackend
        "awslogs-region" = $AwsRegion
        "awslogs-stream-prefix" = "ecs"
      }
    }
    repositoryCredentials = $RepoCredsBlock
    environment = @(@{ name = "NODE_ENV"; value = "production" })
  })
} | ConvertTo-Json -Depth 20

aws ecs register-task-definition --cli-input-json $TdFrontend | Out-Null
aws ecs register-task-definition --cli-input-json $TdBackend  | Out-Null

# -------- ECS Services --------
$SvcFrontendName = "$BaseName-frontend"
$SvcBackendName  = "$BaseName-backend"

$netCfgJson = @{ awsvpcConfiguration = @{ subnets = @($SubnetA,$SubnetB); securityGroups = @($SvcSgId); assignPublicIp = "ENABLED" } } | ConvertTo-Json -Compress

function Service-Exists {
  param([string]$Name)
  $ls = aws ecs list-services --cluster $ClusterName | ConvertFrom-Json
  return ($ls.serviceArns -join " ") -match $Name
}

if ($UseAlb) {
  $lbFrontend = (@(@{ targetGroupArn = $TgFrontendArn; containerName = "frontend"; containerPort = 80 })) | ConvertTo-Json -Compress
  $lbBackend  = (@(@{ targetGroupArn = $TgBackendArn;  containerName = "backend";  containerPort = 5000 })) | ConvertTo-Json -Compress

  if (Service-Exists -Name $SvcFrontendName) {
    aws ecs update-service --cluster $ClusterName --service $SvcFrontendName --task-definition "$BaseName-frontend" | Out-Null
  } else {
    aws ecs create-service --cluster $ClusterName --service-name $SvcFrontendName --task-definition "$BaseName-frontend" --desired-count 1 --launch-type FARGATE --network-configuration $netCfgJson --load-balancers $lbFrontend | Out-Null
  }

  if (Service-Exists -Name $SvcBackendName) {
    aws ecs update-service --cluster $ClusterName --service $SvcBackendName --task-definition "$BaseName-backend" | Out-Null
  } else {
    aws ecs create-service --cluster $ClusterName --service-name $SvcBackendName --task-definition "$BaseName-backend" --desired-count 1 --launch-type FARGATE --network-configuration $netCfgJson --load-balancers $lbBackend | Out-Null
  }
} else {
  # No-ALB fallback: services with public IPs, no load balancer
  if (Service-Exists -Name $SvcFrontendName) {
    aws ecs update-service --cluster $ClusterName --service $SvcFrontendName --task-definition "$BaseName-frontend" | Out-Null
  } else {
    aws ecs create-service --cluster $ClusterName --service-name $SvcFrontendName --task-definition "$BaseName-frontend" --desired-count 1 --launch-type FARGATE --network-configuration $netCfgJson | Out-Null
  }
  if (Service-Exists -Name $SvcBackendName) {
    aws ecs update-service --cluster $ClusterName --service $SvcBackendName --task-definition "$BaseName-backend" | Out-Null
  } else {
    aws ecs create-service --cluster $ClusterName --service-name $SvcBackendName --task-definition "$BaseName-backend" --desired-count 1 --launch-type FARGATE --network-configuration $netCfgJson | Out-Null
  }
}

# -------- Final output --------
Write-Host ""
Write-Host "Setup complete."
if ($UseAlb) {
  Write-Host "ALB DNS: http://$AlbDns"
  Write-Host "REACT_APP_API_URL suggestion: http://$AlbDns/api"
} else {
  Write-Host "ALB not created (not permitted). Services are running with public IPs."
  Write-Host "Get current backend public IP with:"
  Write-Host "  aws ecs list-tasks --cluster $ClusterName --service-name $SvcBackendName --query 'taskArns[0]' --output text | ForEach-Object {"
  Write-Host "    \$tid = \$_; aws ecs describe-tasks --cluster $ClusterName --tasks \$tid --query 'tasks[0].attachments[0].details[?name==`\"networkInterfaceId`\"].value' --output text | ForEach-Object {"
  Write-Host "      aws ec2 describe-network-interfaces --network-interface-ids \$_ --query 'NetworkInterfaces[0].Association.PublicIp' --output text"
  Write-Host "    }"
  Write-Host "  }"
  Write-Host "Then set REACT_APP_API_URL to http://<that-ip>:5000"
}
Write-Host ""
Write-Host "Use these values in your GitHub repo secrets:"
Write-Host "  AWS_REGION          = $AwsRegion"
Write-Host "  ECS_CLUSTER_NAME    = $ClusterName"
Write-Host "  ECS_SERVICE_NAME    = $BaseName"
Write-Host "Also add (if applicable):"
Write-Host "  REACT_APP_API_URL, STRIPE_PUBLISHABLE_KEY, GOOGLE_MAPS_API_KEY"
Write-Host ""
Write-Host "Add this to your deploy job (OIDC):"
Write-Host "  permissions:`n    id-token: write`n    contents: read"
Write-Host "  - uses: aws-actions/configure-aws-credentials@v4"
Write-Host "    with:`n      role-to-assume: arn:aws:iam::$AccountId:role/$GhOidcRoleName`n      aws-region: $AwsRegion"