output "resource_group_id" {
  description = "The Azure resource ID of the resource group"
  value       = module.resource_group.resource_group_id
}

output "resource_group_name" {
  description = "Name of the resource group"
  value       = module.resource_group.resource_group_name
}

output "resource_group_location" {
  description = "Region the resource group was deployed to"
  value       = module.resource_group.resource_group_location
}

output "common_tags" {
  description = "Tags applied to resources"
  value       = local.common_tags
}