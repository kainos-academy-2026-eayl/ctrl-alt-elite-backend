# Values for the dev environment.
# Use with: terraform plan -var-file=dev.tfvars
resource_group_name            = "rg-ctrl-alt-elite-tf-dev"
container_app_environment_name = "cae-ctrl-alt-elite-dev"
frontend_app_name              = "ctrl-alt-elite-frontend-cae"
backend_app_name               = "ctrl-alt-elite-backend-cae"
location                       = "uksouth"
environment                    = "dev"
owner                          = "caolan"

acr_login_server = "acraiacademy26.azurecr.io"
backend_image    = "acraiacademy26.azurecr.io/ctrl-alt-elite-backend:latest"
frontend_image   = "acraiacademy26.azurecr.io/ctrl-alt-elite-frontend:latest"
database_image   = "postgres:17-alpine"

min_replicas = 1
max_replicas = 1

tags = {
  project = "ctrl-alt-elite"
}
