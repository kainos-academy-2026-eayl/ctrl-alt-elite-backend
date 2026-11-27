output "resource_group_name" {
  value = module.application_stack.resource_group_name
}

output "frontend_url" {
  value = module.application_stack.frontend_url
}

output "backend_url" {
  value = module.application_stack.backend_url
}

output "deployed_images" {
  value = {
    backend  = var.backend_image
    frontend = var.frontend_image
  }
}
