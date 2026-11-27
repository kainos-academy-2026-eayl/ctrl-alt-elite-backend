# The incoming application-stack module is expected at this source.
# Until that branch is merged, this environment is scaffolding only and must not
# be used for terraform plan or apply.
module "application_stack" {
  source = "../../modules/application-stack"

  environment                    = var.environment
  resource_group_name            = var.resource_group_name
  container_app_environment_name = var.container_app_environment_name
  location                       = var.location
  owner                          = var.owner
  tags                           = var.tags

  acr_login_server = var.acr_login_server
  backend_image    = var.backend_image
  frontend_image   = var.frontend_image
  frontend_origin  = var.frontend_origin

  jwt_secret        = var.jwt_secret
  database_password = var.database_password
  database_image    = var.database_image
  database_name     = var.database_name
  database_user     = var.database_user
  database_port     = var.database_port
  database_host     = var.database_host
  database_mount    = var.database_mount
}
