variable "environment" {
  description = "Environment represented by this Terraform root"
  type        = string
  default     = "dev"

  validation {
    condition     = var.environment == "dev"
    error_message = "The dev environment root only accepts environment = dev."
  }
}

variable "resource_group_name" {
  description = "Development resource group name"
  type        = string
}

variable "container_app_environment_name" {
  description = "Development Container App Environment name"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string

  validation {
    condition     = contains(["uksouth", "ukwest"], var.location)
    error_message = "Location must be either uksouth or ukwest."
  }
}

variable "owner" {
  description = "Team responsible for development resources"
  type        = string
}

variable "tags" {
  description = "Additional development resource tags"
  type        = map(string)
  default     = {}
}

variable "acr_login_server" {
  description = "Azure Container Registry login server"
  type        = string
}

variable "backend_image" {
  description = "Immutable backend image reference from ACR"
  type        = string
}

variable "frontend_image" {
  description = "Immutable frontend image reference from ACR"
  type        = string
}

variable "frontend_origin" {
  description = "Public development frontend origin"
  type        = string
}

variable "jwt_secret" {
  description = "Development-only JWT signing secret"
  type        = string
  sensitive   = true
}

variable "database_password" {
  description = "Development-only PostgreSQL sidecar password"
  type        = string
  sensitive   = true
}

variable "database_image" {
  description = "PostgreSQL sidecar image"
  type        = string
}

variable "database_name" {
  description = "Development database name"
  type        = string
}

variable "database_user" {
  description = "Development database user"
  type        = string
}

variable "database_host" {
  description = "Internal PostgreSQL sidecar host"
  type        = string
  default     = "127.0.0.1"
}

variable "database_port" {
  description = "Internal PostgreSQL sidecar port"
  type        = number
  default     = 5432
}

variable "database_mount" {
  description = "Development sidecar mount contract; empty until persistent storage is enabled"
  type = object({
    name       = string
    mount_path = string
  })
  default = {
    name       = ""
    mount_path = ""
  }
}

