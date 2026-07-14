# CapMint Cloud Infrastructure Variables (infrastructure/terraform/variables.tf)

variable "project_name" {
  description = "The name of the project, used for prefixing resource names."
  type        = string
  default     = "capmint"
}

variable "environment" {
  description = "Target deployment environment (dev, staging, prod)."
  type        = string
  default     = "staging"
}

variable "region" {
  description = "Target cloud deployment region (AWS or GCP)."
  type        = string
  default     = "us-east-1"
}

# 1. Network Variables
variable "vpc_cidr" {
  description = "CIDR block for the isolated Virtual Private Cloud (VPC)."
  type        = string
  default     = "10.0.0.0/16"
}

# 2. Operational Database Variables (PostgreSQL)
variable "db_instance_class" {
  description = "Database instance node type (e.g. db.t4g.medium, db.m6g.large)."
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "Allocated storage size in Gigabytes."
  type        = number
  default     = 20
}

variable "db_name" {
  description = "The database name to create."
  type        = string
  default     = "capmint_operational"
}

variable "db_username" {
  description = "Master database administrator username."
  type        = string
  default     = "capmint_cloud_admin"
  sensitive   = true
}

# 3. Cache & Telemetry Variables (Redis)
variable "redis_node_type" {
  description = "Redis cluster node instance type (e.g. cache.t4g.medium, cache.m6g.large)."
  type        = string
  default     = "cache.t4g.medium"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache node replicas in the replication group."
  type        = number
  default     = 2
}
