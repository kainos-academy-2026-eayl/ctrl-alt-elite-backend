output "container_app_environment_id" {
  description = "The Azure resource ID of the Container App Environment"
  value       = azurerm_container_app_environment.this.id
}

output "container_app_environment_name" {
  description = "The name of the Container App Environment"
  value       = azurerm_container_app_environment.this.name
}