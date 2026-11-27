environment                    = "dev"
resource_group_name            = "rg-ctrl-alt-elite-tf-dev"
container_app_environment_name = "cae-ctrl-alt-elite-dev"
location                       = "uksouth"
owner                          = "caolan"

acr_login_server = "acraiacademy26.azurecr.io"
backend_image    = "acraiacademy26.azurecr.io/ctrl-alt-elite-backend:REPLACE_WITH_APPROVED_TAG"
frontend_image   = "acraiacademy26.azurecr.io/ctrl-alt-elite-frontend:REPLACE_WITH_APPROVED_TAG"
frontend_origin  = "https://REPLACE_WITH_DEV_FRONTEND_HOST"

database_image = "postgres:17-alpine"
database_name  = "ctrl_alt_elite_dev"
database_user  = "ctrl_alt_elite_dev"
database_host  = "127.0.0.1"
database_port  = 5432

tags = {
  project     = "ctrl-alt-elite"
  environment = "dev"
}
