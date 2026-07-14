# CapMint Cloud Infrastructure Blueprint (infrastructure/terraform/main.tf)
# Target Provider: HashiCorp AWS / Google Cloud (Generic Layout)

terraform {
  required_version = ">= 1.3.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# 1. Isolated Network Infrastructure (VPC & Subnets)
resource "aws_vpc" "capmint_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-vpc"
    Environment = var.environment
  }
}

resource "aws_subnet" "public_subnets" {
  count             = 2
  vpc_id            = aws_vpc.capmint_vpc.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = "${var.region}${count.index == 0 ? "a" : "b"}"

  tags = {
    Name        = "${var.project_name}-${var.environment}-public-${count.index}"
    Environment = var.environment
  }
}

resource "aws_subnet" "private_subnets" {
  count             = 2
  vpc_id            = aws_vpc.capmint_vpc.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = "${var.region}${count.index == 0 ? "a" : "b"}"

  tags = {
    Name        = "${var.project_name}-${var.environment}-private-${count.index}"
    Environment = var.environment
  }
}

# 2. Database Subnet Group & Security Group
resource "aws_db_subnet_group" "db_subnets" {
  name       = "${var.project_name}-${var.environment}-db-subnet-group"
  subnet_ids = aws_subnet.private_subnets[*].id
}

resource "aws_security_group" "db_security_group" {
  name        = "${var.project_name}-${var.environment}-db-sg"
  description = "Operational database security controls"
  vpc_id      = aws_vpc.capmint_vpc.id

  ingress {
    description = "Allow Postgres incoming traffic from private subnets"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 3. Operational Relational Store: RDS PostgreSQL Instance
resource "aws_db_instance" "operational_db" {
  identifier             = "${var.project_name}-${var.environment}-db"
  allocated_storage      = var.db_allocated_storage
  engine                 = "postgres"
  engine_version         = "15.3"
  instance_class         = var.db_instance_class
  db_name                = var.db_name
  username               = var.db_username
  password               = "dummy_secure_password_replace_in_secrets_manager" # Excluded from git commits
  db_subnet_group_name   = aws_db_subnet_group.db_subnets.name
  vpc_security_group_ids = [aws_security_group.db_security_group.id]
  skip_final_snapshot    = var.environment != "prod"

  tags = {
    Environment = var.environment
  }
}

# 4. Cache Subnet Group & Security Group
resource "aws_elasticache_subnet_group" "cache_subnets" {
  name       = "${var.project_name}-${var.environment}-cache-subnet-group"
  subnet_ids = aws_subnet.private_subnets[*].id
}

resource "aws_security_group" "cache_security_group" {
  name        = "${var.project_name}-${var.environment}-cache-sg"
  description = "Redis caching security controls"
  vpc_id      = aws_vpc.capmint_vpc.id

  ingress {
    description = "Allow Redis traffic from private subnets"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 5. Cache & Telemetry Store: ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "telemetry_cache" {
  replication_group_id          = "${var.project_name}-${var.environment}-cache"
  replication_group_description = "Telemetry and anomaly checking caching clusters"
  node_type                     = var.redis_node_type
  num_cache_clusters            = var.redis_num_cache_nodes
  parameter_group_name          = "default.redis7"
  port                          = 6379
  subnet_group_name             = aws_elasticache_subnet_group.cache_subnets.name
  security_group_ids            = [aws_security_group.cache_security_group.id]
  at_rest_encryption_enabled    = true
  transit_encryption_enabled   = true
  auth_token                    = "dummy_secure_token_replace_in_secrets_manager"

  tags = {
    Environment = var.environment
  }
}
