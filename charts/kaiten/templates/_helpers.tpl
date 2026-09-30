{{- define "kaiten.apiFullname" -}}
{{- printf "%s-api" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kaiten.appFullname" -}}
{{- printf "%s-app" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kaiten.labels" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "kaiten.apiLabels" -}}
app.kubernetes.io/name: kaiten-api
{{ include "kaiten.labels" . }}
{{- end }}

{{- define "kaiten.apiSelectorLabels" -}}
app.kubernetes.io/name: kaiten-api
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "kaiten.appLabels" -}}
app.kubernetes.io/name: kaiten-app
{{ include "kaiten.labels" . }}
{{- end }}

{{- define "kaiten.appSelectorLabels" -}}
app.kubernetes.io/name: kaiten-app
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* Resolved RabbitMQ host for init containers */}}
{{- define "kaiten.rabbitmqHost" -}}
{{- default (printf "%s-rabbitmq" .Release.Name) .Values.initContainers.rabbitmqHost }}
{{- end }}

{{/*
Where a workload runs, from one definition instead of one per workload.

Called with a service's own values -- `include "kaiten.scheduling" .Values.api` --
because every one of these keys is per-service by nature: an operator who pins the
API to a node pool has said nothing about where the static frontend runs. What was
duplicated was never the DECISION, only the twenty lines of `with` that render it,
which is why this is one helper over four call sites rather than one shared value.
*/}}
{{- define "kaiten.scheduling" -}}
{{- with .priorityClassName }}
priorityClassName: {{ . }}
{{- end }}
terminationGracePeriodSeconds: {{ .terminationGracePeriodSeconds | default 30 }}
{{- with .nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .topologySpreadConstraints }}
topologySpreadConstraints:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end -}}

{{- define "kaiten.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
The Secret holding the api's install-time credentials, and the whole of this
chart's secret contract.

Two ways it comes to exist, and `existingSecret` wins: this chart renders it from
api.secret's values, or an operator names one they made themselves and this chart
renders nothing. Either way the mount is the same, and it is `optional: true`, so
an absent Secret is a pod that starts and says which settings are missing rather
than a pod stuck in CreateContainerConfigError.

The second form is the seam. A deployment that keeps its secrets in an external
store creates this Secret with External Secrets, in charts of its own, and passes
the name in through api.secret.existingSecret; this chart consumes it by name and
knows nothing about the machinery. An earlier version DID know: it rendered the
ExternalSecret itself, gated on a flag whose own comment said turning it off let
you "use pre-created K8s Secrets" -- which nothing then created, while the mount
stayed unconditional. A stock install needed CRDs it had no way to know about.
*/}}
{{- define "kaiten.apiSecretName" -}}
{{- .Values.api.secret.existingSecret | default (printf "%s-secrets" (include "kaiten.apiFullname" .)) }}
{{- end }}

{{/*
Refuse an api.secret that says two things at once, or one thing that is gone.

api.secret.name was the only spelling here when this chart could not create the
Secret at all: it named one an operator had made. It is api.secret.existingSecret
now, one spelling for one concept, and the old key is refused rather than ignored
-- silently ignored, it means an api mounting <release>-api-secrets while the
credential sits in the Secret the operator actually named.

Both a value and an existingSecret is refused for the same reason. Precedence is
the conventional answer and it is the wrong one here: it means a connection string
an operator wrote, and the chart quietly did not use, pointing at a database
nobody looked at again.
*/}}
{{- define "kaiten.validateApiSecret" -}}
{{- $s := .Values.api.secret | default dict -}}
{{- if hasKey $s "name" -}}
{{- fail "api.secret.name is gone: it is api.secret.existingSecret now. Same meaning -- the name of a Secret you created yourself -- but one spelling, because this chart can also render the Secret from api.secret.databaseConnectionString and two keys naming a Secret is how one of them ends up ignored." -}}
{{- end -}}
{{- if and $s.existingSecret (or $s.databaseConnectionString $s.otelAuthorization) -}}
{{- fail "api.secret.existingSecret and api.secret.databaseConnectionString/otelAuthorization are mutually exclusive: either this chart renders the Secret from your values, or it mounts the one you named and renders nothing. Both set, one of them would have to be silently discarded." -}}
{{- end -}}
{{- end }}

{{/* Is this chart the one rendering that Secret? Only when an operator gave it
something to put in one. Nothing renders an empty Secret: with neither values nor
an existingSecret the name above still resolves, the mount is still optional, and
the api still starts and names the setting it is missing -- which is what a
deployment whose credential is created out-of-band a moment later needs. */}}
{{- define "kaiten.apiSecretFromValues" -}}
{{- $s := .Values.api.secret -}}
{{- if and (not $s.existingSecret) (or $s.databaseConnectionString $s.otelAuthorization) -}}
true
{{- end -}}
{{- end }}

{{/* ── bootstrap.platformCredential ─────────────────────────────────────── */}}

{{- define "kaiten.platformCredentialFullname" -}}
{{- printf "%s-platform-credential" (include "kaiten.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kaiten.platformCredentialLabels" -}}
app.kubernetes.io/name: kaiten-platform-credential
app.kubernetes.io/component: bootstrap
{{ include "kaiten.labels" . }}
{{- end }}

{{- define "kaiten.platformCredentialServiceAccountName" -}}
{{- $b := .Values.bootstrap.platformCredential -}}
{{- $b.serviceAccount.name | default (include "kaiten.platformCredentialFullname" .) }}
{{- end }}

{{/* Where the minted credential is written. `secret` publishes it as a Kubernetes
Secret, which is what an in-cluster consumer mounts; `file` writes it to a path on
a volume the operator supplies, which is what a deployment with no Kubernetes
Secret to write into does. Nothing else is a sink, and neither one knows anything
about a secret store: propagating the Secret outward is a consumer reading the
Secret this Job wrote, in its own release, never this Job's business. */}}
{{- define "kaiten.platformCredentialSink" -}}
{{- $sink := .Values.bootstrap.platformCredential.sink | default dict -}}
{{- $sink.type | default "secret" -}}
{{- end }}

{{/* The path the mint writes to. With the `secret` sink it is a file on the pod's
own in-memory volume, read by the publishing container and gone with the pod; with
the `file` sink it is the operator's path on the operator's volume, and it is the
delivery itself. */}}
{{- define "kaiten.platformCredentialMintPath" -}}
{{- $b := .Values.bootstrap.platformCredential -}}
{{- if eq (include "kaiten.platformCredentialSink" .) "file" -}}
{{- $b.sink.file.path -}}
{{- else -}}
/work/token
{{- end -}}
{{- end }}

{{/* Fails the render rather than the Job. Every one of these is a decision
`kaiten-admin-tools platform-token create` refuses to make on the operator's
behalf, and a chart that supplied a default for any of them would be making it
silently -- at install time, in a hook, on the one occasion the credential's
plaintext exists. */}}
{{- define "kaiten.validatePlatformCredential" -}}
{{- if not .Values.bootstrap.platformCredential.enabled -}}
{{- else -}}
{{- $b := .Values.bootstrap.platformCredential -}}
{{- if not $b.name -}}
{{- fail "bootstrap.platformCredential.name is required when bootstrap.platformCredential.enabled=true — it must be unique among ACTIVE platform credentials, and it is what you revoke and rotate by" -}}
{{- end -}}
{{- if not $b.scopes -}}
{{- fail "bootstrap.platformCredential.scopes is required when bootstrap.platformCredential.enabled=true — a comma-separated list, with no chart default, because whoever names the scopes is deciding the credential's blast radius" -}}
{{- end -}}
{{- if and $b.ttl $b.noExpiry -}}
{{- fail "bootstrap.platformCredential.ttl and .noExpiry are mutually exclusive — set exactly one" -}}
{{- end -}}
{{- if and (not $b.ttl) (not $b.noExpiry) -}}
{{- fail "one of bootstrap.platformCredential.ttl or .noExpiry is required — how long a platform credential lives is a decision, not a fallback" -}}
{{- end -}}
{{- $sink := include "kaiten.platformCredentialSink" . -}}
{{- if not (has $sink (list "secret" "file")) -}}
{{- fail (printf "bootstrap.platformCredential.sink.type must be 'secret' or 'file', got: %q" $sink) -}}
{{- end -}}
{{- if eq $sink "secret" -}}
{{- if not $b.secret.name -}}
{{- fail "bootstrap.platformCredential.secret.name is required with sink.type=secret — it is the only place the minted value ever lands" -}}
{{- end -}}
{{- else -}}
{{- if not $b.sink.file.path -}}
{{- fail "bootstrap.platformCredential.sink.file.path is required with sink.type=file — it is the only place the minted value ever lands" -}}
{{- end -}}
{{- if not $b.sink.file.volume -}}
{{- fail "bootstrap.platformCredential.sink.file.volume is required with sink.type=file — a Kubernetes volume spec (a PVC, a hostPath, whatever the operator has) for the path to be written on; the Job cannot invent somewhere durable to put a credential" -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Name of the Secret holding the connection string the mint runs against.
Defaults to the api's own Secret; see the databaseSecret comment in values.yaml
for why that default is what makes this a post-install hook. */}}
{{- define "kaiten.platformCredentialDatabaseSecretName" -}}
{{- $b := .Values.bootstrap.platformCredential -}}
{{- $b.databaseSecret.name | default (include "kaiten.apiSecretName" .) }}
{{- end }}

{{/* ── api configuration file ───────────────────────────────────────────── */}}

{{/*
kaiten.apiSecretKeys — the keys that hold a credential, and therefore the keys
this ConfigMap may never contain, in any form.

The distinction is the whole design. api.config is rendered into a ConfigMap,
which anything with `get configmaps` can read, so a credential's VALUE cannot go
there — and neither, any more, does its NAME: the loader no longer expands
${VARIABLE} placeholders when it reads its configuration file, so a reference
left in api.config would just be a literal string the process tries to connect
with. These keys are refused outright instead. The credential itself still
reaches the process the same way every other setting does: as an environment
variable, sourced by a secretKeyRef through api.env, api.secret, or
api.secret.existingSecret.

Duplicated from the settings table in api/config/config.go, because a Helm
template cannot read Go. Not left to drift, either: TestChartGuardsEverySecretKey
(api/config/chart_test.go) reads this list back out of this file and fails if it
is not the table's `secret` column, so adding a credential to the API without
adding it here is a red test rather than a leaked secret.

metered.token_file used to be on this list and is deliberately not any more.
It is a PATH to a mounted credential, and a path discloses nothing: it is an
ordinary setting, and it belongs in api.config with the rest of them.
*/}}
{{- define "kaiten.apiSecretKeys" -}}
- database.connection_string
- otel.authorization
{{- end }}

{{/*
Refuse an api.config that says something it must not say.

Two kinds of refusal, both at render:

  * a secret-bearing key -- see kaiten.apiSecretKeys. A ConfigMap is readable by
    anything with `get configmaps`, so this key may not be set here at all,
    regardless of what it holds.
  * server.port / server.platform_port -- chart-owned. They come from
    api.service.port and api.service.platformPort, because the Service and the
    listener have to agree and two places to say one port is one place too many.
    That duplication is what api.env carried before this: KAITEN_API_PORT: "3000"
    beside api.service.port: 3000, with nothing keeping them equal.
*/}}
{{- define "kaiten.validateApiConfig" -}}
{{- $cfg := .Values.api.config | default dict -}}
{{- $obs := (.Values.global | default dict).observability -}}
{{- if $obs -}}
{{- fail "global.observability is gone: set api.config.otel.{enabled,endpoint,insecure} instead. Refused rather than ignored, because a telemetry setting that silently stopped applying is worse than one that stops the render — this is the only place that tells you." -}}
{{- end -}}
{{- range $key := (include "kaiten.apiSecretKeys" . | fromYamlArray) -}}
{{- $section := splitList "." $key -}}
{{- $held := $cfg -}}
{{- range $step := (initial $section) -}}
{{- $held = get ($held | default dict) $step -}}
{{- end -}}
{{- $value := get ($held | default dict) (last $section) -}}
{{- if $value -}}
{{- fail (printf "api.config.%s is a credential, and api.config is rendered into a ConfigMap that anything with `get configmaps` in this namespace can read. It may not be set here at all — the loader no longer expands a ${...} placeholder, so even a reference would just be a literal string. Source it as an environment variable instead: put the value in api.secret, name your own Secret in api.secret.existingSecret, or add it with api.extraEnv." $key) -}}
{{- end -}}
{{- end -}}
{{- $server := get $cfg "server" | default dict -}}
{{- range $key := (list "port" "platform_port") -}}
{{- if hasKey $server $key -}}
{{- fail (printf "api.config.server.%s is set by the chart, from api.service.port and api.service.platformPort — the Service and the listener must agree, so there is one place to say it and this is not it" $key) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
The API's configuration document: api.config, plus the one thing the chart owns.

The ports come from api.service because the Service publishes them -- the Service
and the listener have to agree, and two places to say one port is one place too
many. Everything else in this document is api.config verbatim, which is what
makes the file an operator writes and the file the pod reads the same document.
*/}}
{{- define "kaiten.apiConfig" -}}
{{- $cfg := deepCopy (.Values.api.config | default dict) -}}
{{- $_ := set $cfg "server" (dict "port" (int .Values.api.service.port) "platform_port" (int .Values.api.service.platformPort)) -}}
{{- toYaml $cfg -}}
{{- end -}}
