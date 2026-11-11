# -----------------------------------------------------------------------------
# Input variables: the "parameters" of this configuration.
# Values are supplied (lowest -> highest priority) via:
#   default below -> TF_VAR_<name> env var -> terraform.tfvars / *.auto.tfvars
#   -> -var-file=... -> -var 'name=value'
# Variables with no default are REQUIRED; Terraform will prompt if missing.
# -----------------------------------------------------------------------------

variable "resource_group_name" {
  description = "Name of the Azure resource group to create"
  type        = string
  # No default: the name is required so you never deploy with a generic one.

  # Azure rule: 1-90 chars of letters, digits, . _ - ( ), and cannot end in "."
  # can() returns false instead of erroring when regex() finds no match.
  validation {
    condition     = can(regex("^[-\\w\\.\\(\\)]{0,89}[-\\w\\(\\)]$", var.resource_group_name))
    error_message = "Resource group name must be 1-90 characters (letters, digits, . _ - ( )) and must not end with a period."
  }
}

variable "location" {
  description = "Azure region to deploy into"
  type        = string
  default     = "uksouth" # sensible default: our primary UK region

  # Restrict to approved regions (e.g. for data residency).
  validation {
    condition     = contains(["uksouth", "ukwest"], var.location)
    error_message = "Location must be either uksouth or ukwest."
  }
}

variable "environment" {
  description = "Deployment environment (dev, test or prod)"
  type        = string
  default     = "dev" # safest default: never accidentally target prod

  # contains() checks the value is in the allowed list; plan fails otherwise.
  validation {
    condition     = contains(["dev", "test", "prod"], var.environment)
    error_message = "Environment must be one of: dev, test, prod."
  }
}

variable "owner" {
  description = "Person or team responsible for these resources (used as a tag)"
  type        = string
  default     = "caolan"
}

variable "tags" {
  description = "Additional tags to merge onto the default tags"
  type        = map(string) # a map of string keys to string values
  default     = {}          # empty map = no extra tags unless provided
}
