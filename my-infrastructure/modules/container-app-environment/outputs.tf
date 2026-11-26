output "container_app_environment_id" {
  description = "The Azure resource ID of the Container App Environment"
  value       = azurerm_container_app_environment.this.id
}

output "container_app_environment_name" {
  description = "The name of the Container App Environment"
  value       = azurerm_container_app_environment.this.name
}

output "container_app_environment_default_domain" {
  description = "The default, publicly resolvable, domain of the Container App Environment. Stable across revisions, unlike a Container App's latest_revision_fqdn."
  value       = azurerm_container_app_environment.this.default_domain
}