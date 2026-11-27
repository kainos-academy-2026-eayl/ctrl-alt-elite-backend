# Values for the prod environment.
# Use with the backend-prod.tfstate key and: terraform plan -var-file=prod.tfvars
resource_group_name            = "rg-ctrl-alt-elite-tf-prod"
container_app_environment_name = "cae-ctrl-alt-elite-prod"
frontend_app_name              = "ctrl-alt-elite-frontend-cae-prod"
backend_app_name               = "ctrl-alt-elite-backend-cae-prod"
location                       = "uksouth"
environment                    = "prod"
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
