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

resource "azurerm_user_assigned_identity" "app" {
  name                = "id-ctrl-alt-elite-${var.environment}"
  resource_group_name = module.resource_group.resource_group_name
  location            = module.resource_group.resource_group_location
  tags                = local.common_tags
}

resource "azurerm_storage_account" "practice" {
  name                     = "ctrlaltdeletegroup"
  resource_group_name      = module.resource_group.resource_group_name
  location                 = module.resource_group.resource_group_location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"
  access_tier              = "Hot"

  tags = merge(
    local.common_tags,
    {
      exercise = "part-c-tag-update"
      purpose  = "terraform-practice"
      team     = "ctrl-alt-elite"
    }
  )
}


moved {
  from = azurerm_resource_group.test
  to   = module.resource_group.azurerm_resource_group.test
}

resource "azurerm_key_vault" "example" {
  name                       = "CtrlVaultElite"
  location                   = module.resource_group.resource_group_location
  resource_group_name        = module.resource_group.resource_group_name
  rbac_authorization_enabled = true
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  soft_delete_retention_days = 7
  purge_protection_enabled   = true

  sku_name = "standard"


}
data "azurerm_client_config" "current" {}
