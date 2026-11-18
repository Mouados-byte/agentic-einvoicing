{{- define "einvoice.labels" -}}
app.kubernetes.io/part-of: einvoice-agents
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}
