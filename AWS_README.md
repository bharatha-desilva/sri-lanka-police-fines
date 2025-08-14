### Immediate fix
- Add a repo secret named `AWS_REGION` with your AWS region (e.g., `ap-south-1`). The workflow expects `secrets.AWS_REGION` and fails if it’s missing.

### Two ways to wire AWS auth for deployments

#### Option A (quick): IAM user with access keys
1. In AWS IAM, create a user (e.g., `github-actions-deployer`) with programmatic access.
2. Attach a least-privilege policy that allows ECS deployments. Example policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ecs:DescribeClusters","ecs:DescribeServices","ecs:UpdateService","ecs:DescribeTaskDefinition","ecs:ListServices"], "Resource": "*" },
    { "Effect": "Allow", "Action": ["iam:PassRole"], "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/<YourEcsTaskExecutionRole>" }
  ]
}
```
3. Create access keys for the user and add these GitHub repo secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION` (e.g., `ap-south-1`)
   - `ECS_CLUSTER_NAME` (e.g., `my-cluster`)
   - `ECS_SERVICE_NAME` (base name used by your workflow; it updates `<name>-backend` and `<name>-frontend`)

Your current workflow will then work without edits.

#### Option B (recommended): GitHub OIDC + IAM role (no long-lived keys)
1. In AWS IAM, ensure OIDC provider `token.actions.githubusercontent.com` exists (AWS account-level setting).
2. Create an IAM role (e.g., `GitHubActionsECSDeployRole`) with:
   - Trust policy limiting who can assume it (replace org/repo/branch):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike": { "token.actions.githubusercontent.com:sub": "repo:<GITHUB_OWNER>/<REPO>:ref:refs/heads/main" }
      }
    }
  ]
}
```
   - The same ECS permissions policy as in Option A.
3. In your workflow job that deploys to AWS, switch to role assumption:
   - Add job permissions:
```yaml
permissions:
  id-token: write
  contents: read
```
   - Configure the action:
```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::<ACCOUNT_ID>:role/GitHubActionsECSDeployRole
    aws-region: ap-south-1
```
4. Remove `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` secrets; keep `AWS_REGION`.

### ECS setup required for this workflow
- Create an ECS cluster named in `ECS_CLUSTER_NAME`.
- Create two ECS services in that cluster named:
  - `<ECS_SERVICE_NAME>-backend`
  - `<ECS_SERVICE_NAME>-frontend`
- Ensure each service uses a task definition whose container image points to your GHCR images with the `:latest` tag:
  - `ghcr.io/<owner>/<repo>-backend:latest`
  - `ghcr.io/<owner>/<repo>-frontend:latest`
- Because the workflow pushes `:latest` for the default branch, the step `aws ecs update-service --force-new-deployment` will pull the new image.

### If your GHCR images are private
- Either make the GHCR repositories public, or configure private registry credentials in ECS:
  - Create a GitHub PAT with `read:packages`.
  - Store the `username` and `password` in AWS Secrets Manager as a JSON or two plaintext secrets.
  - In your task definition container, set `repositoryCredentials.credentialsParameter` to the secret ARN so ECS can pull from GHCR.

### GitHub repo secrets summary
- Required now:
  - `AWS_REGION`
  - If using Option A: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - `ECS_CLUSTER_NAME` (e.g., `my-cluster`)
  - `ECS_SERVICE_NAME` (base name; workflow appends `-backend` and `-frontend`)
- Optional:
  - `SLACK_WEBHOOK_URL` (only if you use notifications)
  - If using GHCR private: secret(s) in AWS, referenced by ECS task definition, not the GitHub repo

After adding `AWS_REGION` (and credentials per chosen option), rerun the workflow.