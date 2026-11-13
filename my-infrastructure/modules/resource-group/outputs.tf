output "resource_group_id" {
  description = "The Azure resource ID of the resource group"
  value       = azurerm_resource_group.test.id
}

output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.test.name
}

output "resource_group_location" {
  description = "Region the resource group was deployed to"
  value       = azurerm_resource_group.test.location
}