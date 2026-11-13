resource "azurerm_resource_group" "test" {
  name     = var.resource_group_name # changing this forces a destroy + recreate
  location = var.location            # changing this also forces a recreate
  tags     = var.tags                # tags can be changed in-place
}
