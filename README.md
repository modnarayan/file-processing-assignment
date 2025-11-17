# S3 → MongoDB Processing System (Assignment Solution)

Live endpoints (deployed on EC2 - t2.micro):

- Upload: http://ec2-13-201-99-231.ap-south-1.compute.amazonaws.com/upload
- Process: http://ec2-13-201-99-231.ap-south-1.compute.amazonaws.com/process/:fileKey

## Features Implemented

- Streaming upload/download → handles multi-GB files without OOM
- No external queue libraries (pure MongoDB-based FIFO queue)
- Jobs survive server restarts
- Fair FIFO processing
- Batch inserts (1000 docs) → MongoDB stays happy
- Resilient parsing (bad lines are skipped)
- Main server stays responsive during heavy processing
- Concurrent workers (3 by default)

## Deploy on EC2 (Amazon Linux 2023 / Ubuntu)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs git

git clone git remote add origin https://github.com/modnarayan/file-processing-assignment.git
npm install

cp .env.example .env
# Edit .env → put your S3 bucket name and MongoDB Atlas connection string

# Give EC2 instance an IAM role with S3 full access (or use access keys)

# Run
node app.js
# or better: pm2 start app.js --name processing-api

# Open port 3000 in the security group
```
