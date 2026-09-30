{{- define "kaiten-infra.rabbitmqName" -}}
{{- printf "%s-rabbitmq" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kaiten-infra.rabbitmqDefaultUserSecretName" -}}
{{- printf "%s-default-user" (include "kaiten-infra.rabbitmqName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kaiten-infra.debeziumServerName" -}}
{{- printf "%s-debezium-server" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kaiten-infra.debeziumServiceAccountName" -}}
{{- printf "%s-debezium" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}


{{- define "kaiten-infra.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
── Credentials ───────────────────────────────────────────────────────────────

Two ways in, for every credential this chart's workloads need, and
`existingSecret` wins outright:

  values         -- give the chart the credential and it renders the Secret
                    holding it. One `helm install`, no operator, no CRDs.
  existingSecret -- name a Secret you created yourself, by whatever means, and
                    the chart renders NO Secret at all and points the workload
                    at yours.

That second form is the seam between this chart and whatever manages secrets
around it. A deployment that keeps them in an external store creates these
Secrets with External Secrets over Vault or a cloud secrets manager, in its own
charts, and hands the names in here. This chart never learns that machinery
exists -- which is the point: the objects that used to live here
(ExternalSecret, SecretStore, Vault policies and auth roles) made a stock
install need CRDs from a vendor's cluster to render at all.

Neither way configured is refused at render, not deferred. A workload pointed
at a Secret nothing creates is a Job in CreateContainerConfigError or a
DebeziumServer that never goes Ready, discovered minutes later in a pod
description; a refusal names the two values that would fix it.
*/}}

{{- define "kaiten-infra.migrateSecretName" -}}
{{- .Values.migrate.database.existingSecret | default (printf "%s-migrate-db" (include "kaiten-infra.fullname" .)) }}
{{- end }}

{{/* The key inside it. The chart's own Secret uses the environment variable's
own name; an operator's Secret uses whatever they called it. */}}
{{- define "kaiten-infra.migrateSecretKey" -}}
{{- if .Values.migrate.database.existingSecret -}}
{{- .Values.migrate.database.existingSecretKey }}
{{- else -}}
KAITEN_DATABASE_CONNECTION_STRING
{{- end -}}
{{- end }}

{{- define "kaiten-infra.debeziumSecretName" -}}
{{- .Values.debeziumServer.database.existingSecret | default (printf "%s-debezium-db" (include "kaiten-infra.fullname" .)) }}
{{- end }}

{{/* Did the operator give us the Debezium connection as values? Any one field
counts: a partial answer is a mistake worth rendering, because the Secret it
produces is the thing whose missing key Debezium will name. */}}
{{- define "kaiten-infra.debeziumCredentialsFromValues" -}}
{{- $c := .Values.debeziumServer.database.credentials | default dict -}}
{{- if or $c.hostname $c.dbname $c.username $c.password -}}
true
{{- end -}}
{{- end }}
