$REGION = "us-east-1"  # change if needed
aws configure set region $REGION
aws ec2 create-default-vpc