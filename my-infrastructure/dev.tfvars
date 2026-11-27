# Values for the dev environment.
# Use with: terraform plan -var-file=dev.tfvars
resource_group_name            = "rg-ctrl-alt-elite-tf-dev"
container_app_environment_name = "cae-ctrl-alt-elite-dev"
location                       = "uksouth"
environment                    = "dev"
owner                          = "caolan"

acr_login_server = "acraiacademy26.azurecr.io"
backend_image = "acraiacademy26.azurecr.io/ctrl-alt-elite-backend:23c48ef8d1ff3d5ce84addf730a8d3edd00ff673"
frontend_image   = "acraiacademy26.azurecr.io/ctrl-alt-elite-frontend:63360c7e08995ee3849255e8a494022de7e9ef5a"
database_image = "postgres:17-alpine"

tags = {
  project = "ctrl-alt-elite"
}
