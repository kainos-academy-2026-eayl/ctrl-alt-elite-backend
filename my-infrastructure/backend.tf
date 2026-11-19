terraform {
  backend "azurerm" {
    storage_account_name = "ctrlaltelitestate"
    container_name       = "tfstate"
    key                  = "backend-dev.tfstate"
    use_azuread_auth     = true
    use_cli              = true
  }
}
