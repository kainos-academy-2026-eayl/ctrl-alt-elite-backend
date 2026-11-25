resource "azurerm_container_app_environment" "this" {
  name                = var.container_app_environment_name
  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = var.tags
}