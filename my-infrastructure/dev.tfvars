# Values for the dev environment.
# Use with: terraform plan -var-file=dev.tfvars
resource_group_name            = "rg-ctrl-alt-elite-tf-dev"
container_app_environment_name = "cae-ctrl-alt-elite-dev"
location                       = "uksouth"
environment                    = "dev"
owner                          = "caolan"

acr_login_server = "acraiacademy26.azurecr.io"
# backend_image and frontend_image come from the BACKEND_IMAGE and FRONTEND_IMAGE
# GitHub repository variables (TF_VAR_*). Values here would override them.
database_image = "postgres:17-alpine"

tags = {
  project = "ctrl-alt-elite"
}
