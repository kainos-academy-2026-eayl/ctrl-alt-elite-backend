# -----------------------------------------------------------------------------
# Locals = values computed inside this config (not supplied by the user).
# Use them to avoid repeating the same expression in multiple places.
# -----------------------------------------------------------------------------

resource "azurerm_container_app" "frontend" {
  name                         = "ctrl-alt-elite-frontend-${var.environment}"
  resource_group_name          = module.resource_group.resource_group_name
  container_app_environment_id = module.container_app_environment.container_app_environment_id
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  registry {
    server   = var.acr_login_server
    identity = azurerm_user_assigned_identity.app.id
  }

  secret {
    name  = "jwt-secret"
    value = var.jwt_secret
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "frontend"
      image  = var.frontend_image
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name  = "BACKEND_ORIGIN"
        value = "https://${azurerm_container_app.backend.latest_revision_fqdn}"
      }

      env {
        name        = "JWT_SECRET"
        secret_name = "jwt-secret"
      }
    }
  }

  ingress {
    external_enabled           = true
    allow_insecure_connections = false
    target_port                = 3000

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  tags = local.common_tags
}


resource "azurerm_container_app" "backend" {
  name                         = "ctrl-alt-elite-backend-dev"
  resource_group_name          = module.resource_group.resource_group_name
  container_app_environment_id = module.container_app_environment.container_app_environment_id
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  registry {
    server   = var.acr_login_server
    identity = azurerm_user_assigned_identity.app.id
  }

  secret {
  name  = "database-url"
  value = var.database_url
  }

  secret {
    name  = "jwt-secret"
    value = var.jwt_secret
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "backend"
      image  = var.backend_image
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "PORT"
        value = "3001"
      }

      env {
        name  = "FRONTEND_ORIGIN"
        value = var.frontend_origin
      }

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      env {
        name        = "JWT_SECRET"
        secret_name = "jwt-secret"
      }
    }
  }

  ingress {
  external_enabled           = true
  allow_insecure_connections = false
  target_port                = 3001

  traffic_weight {
    latest_revision = true
    percentage      = 100
  }
}

  tags = local.common_tags
}



locals {
  # merge() combines maps left-to-right. Keys in var.tags override the
  # defaults below, so callers can add or replace tags without editing code.
  common_tags = merge(
    {
      Environment = var.environment
      Owner       = var.owner
      managed_by  = "terraform"
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

module "container_app_environment" {
  source = "./modules/container-app-environment"

  container_app_environment_name = var.container_app_environment_name
  resource_group_name            = module.resource_group.resource_group_name
  location                       = module.resource_group.resource_group_location
  tags                           = local.common_tags
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
