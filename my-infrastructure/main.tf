# -----------------------------------------------------------------------------
# Locals = values computed inside this config (not supplied by the user).
# Use them to avoid repeating the same expression in multiple places.
# -----------------------------------------------------------------------------
locals {
  # merge() combines maps left-to-right. Keys in var.tags override the
  # defaults below, so callers can add or replace tags without editing code.
  common_tags = merge(
    {
      Environment = var.environment
      Owner       = var.owner
      managed_by  = "terraform" # signals "don't change this by hand in the portal"
    },
    var.tags
  )
}

module "resource_group" {
  source = "./modules/resource-group"

  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = local.common_tags
}

moved {
  from = azurerm_resource_group.test
  to   = module.resource_group.azurerm_resource_group.test
}