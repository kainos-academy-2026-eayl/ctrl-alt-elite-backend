# -----------------------------------------------------------------------------
# Locals = values computed inside this config (not supplied by the user).
# Use them to avoid repeating the same expression in multiple places.
# -----------------------------------------------------------------------------

resource "azurerm_container_app" "frontend" {
  name                         = "ctrl-alt-elite-frontend-cae"
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
        name = "BACKEND_ORIGIN"
        # Built from the environment's stable default_domain rather than
        # azurerm_container_app.backend.latest_revision_fqdn, which embeds an
        # auto-generated revision suffix that changes on every backend
        # redeploy and causes "provider produced inconsistent final plan"
        # errors during apply.
        value = "https://${azurerm_container_app.backend.name}.${module.container_app_environment.container_app_environment_default_domain}"
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
  name                         = "ctrl-alt-elite-backend-cae"
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

  secret {
    name  = "database-password"
    value = var.database_password
  }

  secret {
    name = "database-url"
    value = join("", [
      "postgresql://ctrl_alt_elite:",
      local.database_password_uri_encoded,
      "@127.0.0.1:5432/ctrl_alt_elite"
    ])
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
    container {
      name   = "database"
      image  = var.database_image
      cpu    = 0.25
      memory = "0.5Gi"
      # The default postgres entrypoint is replaced with a small wrapper that
      # takes an exclusive lock on the data volume before starting Postgres.
      # Azure Container Apps can briefly run two replicas of the same
      # revision at once during a rolling deploy; without this lock, two
      # Postgres processes writing to the same Azure Files share at the same
      # time would corrupt the data directory.
      command = ["/bin/sh", "-c"]
      args = [
        <<-EOT
          exec 9>/var/lib/postgresql/data/.instance.lock
          echo "Waiting for exclusive lock on the database volume..."
          flock 9
          echo "Lock acquired; starting PostgreSQL."
          exec docker-entrypoint.sh postgres
        EOT
      ]

      env {
        name = "PGDATA"
        # Postgres's own data directory is placed in a subfolder of the
        # mount, not at the mount's root. Azure Files shares can contain
        # metadata Postgres doesn't expect to see directly inside PGDATA;
        # giving it a dedicated subfolder avoids that clash.
        value = "/var/lib/postgresql/data/pgdata"
      }

      env {
        name  = "POSTGRES_USER"
        value = "ctrl_alt_elite"
      }

      env {
        name        = "POSTGRES_PASSWORD"
        secret_name = "database-password"
      }

      env {
        name  = "POSTGRES_DB"
        value = "ctrl_alt_elite"
      }

      volume_mounts {
        name = "postgres-data"
        path = "/var/lib/postgresql/data"
      }
    }

    volume {
      name         = "postgres-data"
      storage_type = "AzureFile"
      storage_name = azurerm_container_app_environment_storage.database.name
      # Azure Files is an SMB share: every file on it reports the same fixed
      # owner/permissions, set once here at mount time, rather than letting
      # each container chmod/chown individually. uid/gid 70 is the
      # "postgres" user baked into the official postgres image, and
      # dir_mode/file_mode 0700/0600 match what Postgres insists its data
      # directory look like on startup.
      mount_options = "uid=70,gid=70,dir_mode=0700,file_mode=0600"
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
  database_password_uri_encoded = replace(
    urlencode(var.database_password),
    "+",
    "%20",
  )
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


resource "azurerm_storage_account" "database" {
  # Backs the "postgres-data" file share mounted into the database
  # container below, so Postgres's data directory survives container
  # restarts and redeploys instead of living on the container's own
  # throwaway disk.
  name                     = "ctrlaltelitedbdev"
  resource_group_name      = module.resource_group.resource_group_name
  location                 = module.resource_group.resource_group_location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"
  access_tier              = "Hot"

  tags = local.common_tags
}

resource "azurerm_storage_share" "database" {
  name               = "postgres-data"
  storage_account_id = azurerm_storage_account.database.id
  enabled_protocol   = "SMB"
  quota              = 5 # GiB
}

resource "azurerm_container_app_environment_storage" "database" {
  name                         = "postgres-data"
  container_app_environment_id = module.container_app_environment.container_app_environment_id
  account_name                 = azurerm_storage_account.database.name
  access_key                   = azurerm_storage_account.database.primary_access_key
  share_name                   = azurerm_storage_share.database.name
  access_mode                  = "ReadWrite"
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


