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

# -----------------------------------------------------------------------------
# The resource group itself. Every value now comes from a variable or local,
# so the same code can deploy dev/test/prod just by changing the inputs.
# -----------------------------------------------------------------------------
resource "azurerm_resource_group" "test" {
  name     = var.resource_group_name # changing this forces a destroy + recreate
  location = var.location            # changing this also forces a recreate
  tags     = local.common_tags       # tags can be changed in-place
}
