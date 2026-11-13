# Values for the dev environment.
# Use with: terraform plan -var-file=dev.tfvars
resource_group_name = "rg-ctrl-alt-elite-tf-dev"
location            = "uksouth"
environment         = "dev"
owner               = "caolan"

tags = {
  project = "ctrl-alt-elite"
}
