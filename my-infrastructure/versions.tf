terraform {
  backend "azurerm" {
    storage_account_name = "ctrlaltelitestate"
    container_name       = "tfstate"
    key                  = "backend-dev.tfstate"
    use_azuread_auth     = true
    use_cli              = true
  }
  required_version = ">= 1.17.0, < 2.0.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}


548a35b4-82aa-4469-88e8-7d529fac8a8a