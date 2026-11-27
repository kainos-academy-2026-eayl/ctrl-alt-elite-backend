# Development Terraform root

`dev` is a dedicated Terraform root with its own backend state key, variable
file, sensitive deployment inputs, managed identity, Container Apps, and
PostgreSQL sidecar.

The environment root expects the reusable module at
`my-infrastructure/modules/application-stack`. The module branch is not present
yet, so this directory is scaffolding only. Do not initialise, plan, or
apply them until that module is merged and its contract has been reconciled
with `main.tf`.

## State

Use the backend file from the dev environment:

```sh
terraform -chdir=my-infrastructure/environments/dev init \
  -backend-config=backend.hcl
```

Dev uses `ctrl-alt-elite-dev.tfstate`.

## Values and secrets

The committed `dev.tfvars` file contains only placeholders and non-secret
values. There are no secret tfvars templates. Store sensitive values in GitHub,
under the repository's **Settings > Environments**:

- the `dev` environment contains its own `JWT_SECRET` and `DATABASE_PASSWORD`.

The Terraform workflow exposes these GitHub Environment secrets to Terraform
as `TF_VAR_jwt_secret` and `TF_VAR_database_password`. Terraform reads the
values into the sensitive variables declared by the dev root, and the
reusable module passes them to Container App secret entries. The application
containers read `JWT_SECRET` and `DATABASE_URL`; they never access GitHub
secrets directly.

Never place secret values in a committed tfvars file, share them between
environments, or add a fallback repository-level secret.

The environment has a PostgreSQL sidecar. The backend receives only its own
database connection secret. A persistent storage mount and backup/restore
process must be configured before relying on this environment for durable
data.

## Shared module contract

The incoming `application-stack` module must expose:

**Inputs**

- deployment metadata: `environment`, `resource_group_name`,
  `container_app_environment_name`, `location`, `owner`, `tags`;
- ACR and images: `acr_login_server`, `backend_image`, `frontend_image`;
- origins: `frontend_origin`;
- sensitive values: `jwt_secret`, `database_password`;
- sidecar settings: `database_image`, `database_name`, `database_user`,
  `database_host`, `database_port`, `database_mount`;

**Outputs**

- `resource_group_name`
- `frontend_url`
- `backend_url`

The module must configure the dev managed identity and secret references, assign
`AcrPull`, and keep the database sidecar without external ingress.

## Required activation checks

After the module branch is merged:

1. Confirm every input and output in the contract matches the module.
2. Run `terraform fmt -check -recursive`.
3. Run `terraform init -backend=false` and `terraform validate` in the dev root.
4. Review plans for unexpected replacements and verify the state key.
5. Replace all `REPLACE_WITH_*` placeholders with reviewed values.
6. Add authenticated dev CI plan jobs only after validation succeeds.
