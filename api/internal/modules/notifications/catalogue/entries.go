package catalogue

import (
	"encoding/json"
	"fmt"

	componentevents "github.com/kaitencloud/kaiten/api/internal/modules/components/events"
	customerevents "github.com/kaitencloud/kaiten/api/internal/modules/customers/events"
	deploymentzoneevents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	identityevents "github.com/kaitencloud/kaiten/api/internal/modules/identity/events"
	instanceevents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	licenseevents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	releaseevents "github.com/kaitencloud/kaiten/api/internal/modules/releases/events"
)

// Groups the settings page renders under. The client owns the heading and the
// description for each (app/src/features/notifications/components); the server
// owns which group an event belongs to, and a group the client does not know
// falls back to "other", so adding one here never hides an event.
const (
	GroupDeployments = "deployments"
	GroupInstances   = "instances"
	GroupUsage       = "usage"
	GroupCustomers   = "customers"
	GroupLicensing   = "licensing"
	GroupSecurity    = "security"
)

// Where clicking a notification goes. These are the app's routes, not the API's
// resources -- instances live under /customers in the UI, which nothing in a
// payload could tell you -- so they are written here, beside the renderers that
// build them, and read like the route tree they mirror (app/src/routes).
//
// A link goes to the object's own page only while that page exists. A deleted
// object has none, and neither do components or tokens, which the app lists
// without giving them a page each: those link to the list instead.
const (
	instancesPath       = "/customers/instances"
	customersPath       = "/customers"
	releasesPath        = "/releases"
	componentsPath      = "/releases/components"
	deploymentZonePath  = "/releases/deployment-zones"
	licensesPath        = "/licenses"
	serviceAccountsPath = "/integrations/service-accounts"

	// instanceEntitlementsTab is the instance page's usage tab, where whoever
	// reads a usage notification has to look.
	instanceEntitlementsTab = "entitlements"
)

// What is notifiable, out of everything this API publishes.
//
// The full vocabulary is the OpenAPI document's `webhooks` section -- 49 events
// at the time of writing, generated from the same events.Metadata values used
// here -- and this is the subset a PERSON could act on. Two separate decisions,
// deliberately kept apart:
//
//   - REGISTERED OR NOT: is there any reader who would want this in a bell?
//     Three events are absent because they fire per request or per report rather
//     than per decision, and would bury everything else: FEATURE_FLAG_EVALUATED,
//     ENTITLEMENT_VALUE_GET and ENTITLEMENT_USAGE_REPORT_ACCEPTED. The
//     metadata-field, entitlement-catalogue and entitlement-group events are
//     absent for a duller reason: they are this product's own configuration,
//     changed by the same people reading this page, and a notification that
//     reports what you just did is noise. Any of them is one entry away from
//     being notifiable, which is the point of having a catalogue.
//
//   - DEFAULT ON OR OFF: would a reader who never opened the settings page want
//     to be interrupted by it? Lifecycle events and failures are on. The
//     "updated" events, the infrastructure ones, and anything a teammate does
//     routinely are off and discoverable in settings.
func init() {
	// ── Instances ────────────────────────────────────────────────────────────

	Register(Entry{
		Event:    instanceevents.InstanceCreated,
		Group:    GroupInstances,
		Object:   ObjectInstance,
		Label:    "Instance created",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderInstance("%s was created", "New instance in %s"),
	})

	Register(Entry{
		Event:    instanceevents.InstanceDeployed,
		Group:    GroupDeployments,
		Object:   ObjectInstance,
		Label:    "Instance deployed",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderInstance("%s was deployed", "Deployed to %s"),
	})

	Register(Entry{
		Event:    instanceevents.InstanceDeleted,
		Group:    GroupInstances,
		Object:   ObjectInstance,
		Label:    "Instance deleted",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderInstance("%s was deleted", "Deleted from %s"),
	})

	Register(Entry{
		Event:    instanceevents.InstanceMigrated,
		Group:    GroupInstances,
		Object:   ObjectInstance,
		Label:    "Instance migrated",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderInstance("%s was migrated", "Now in %s"),
	})

	// The commercial stage of an instance -- TRIAL, ACTIVE, AT_RISK, CHURNED --
	// which is most of what a vendor watching its own fleet wants told.
	Register(Entry{
		Event:    instanceevents.InstanceLifecycleStageChanged,
		Group:    GroupInstances,
		Object:   ObjectInstance,
		Label:    "Instance lifecycle stage changed",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderInstanceLifecycle,
	})

	Register(Entry{
		Event:    instanceevents.InstanceStatusChanged,
		Group:    GroupInstances,
		Object:   ObjectInstance,
		Label:    "Instance status changed",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderInstanceStatus,
	})

	// Registered, and off: it fires on every edit, including the one the API
	// makes moments after a create.
	Register(Entry{
		Event:    instanceevents.InstanceUpdated,
		Group:    GroupInstances,
		Object:   ObjectInstance,
		Label:    "Instance updated",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderInstance("%s was updated", "In %s"),
	})

	// ── Customers ────────────────────────────────────────────────────────────

	Register(Entry{
		Event:    customerevents.CustomerCreated,
		Group:    GroupCustomers,
		Object:   ObjectCustomer,
		Label:    "Customer created",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderEntity("%s was added as a customer", customersPath),
	})

	Register(Entry{
		Event:    customerevents.CustomerUpdated,
		Group:    GroupCustomers,
		Object:   ObjectCustomer,
		Label:    "Customer updated",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderEntity("%s was updated", customersPath),
	})

	Register(Entry{
		Event:    customerevents.CustomerDeleted,
		Group:    GroupCustomers,
		Object:   ObjectCustomer,
		Label:    "Customer deleted",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderOnList("%s was deleted", customersPath),
	})

	// A rejection is a failure somebody has to look at, which is why it is on
	// while its successful twin above is a matter of taste. The customer was
	// never created, so there is no page to open.
	Register(Entry{
		Event:    customerevents.CustomerCreationRejected,
		Group:    GroupCustomers,
		Object:   ObjectCustomer,
		Label:    "Customer creation rejected",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderOnList("Creating customer %s was rejected", customersPath),
	})

	// ── Deployments and releases ─────────────────────────────────────────────

	Register(Entry{
		Event:    releaseevents.ReleaseCreated,
		Group:    GroupDeployments,
		Object:   ObjectRelease,
		Label:    "Release published",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderRelease,
	})

	Register(Entry{
		Event:    deploymentzoneevents.ReleaseDeployed,
		Group:    GroupDeployments,
		Object:   ObjectDeploymentZone,
		Label:    "Release deployed to a zone",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderReleaseDeployed,
	})

	Register(Entry{
		Event:    releaseevents.ReleaseDeleted,
		Group:    GroupDeployments,
		Object:   ObjectRelease,
		Label:    "Release deleted",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderOnList("Release %s was deleted", releasesPath),
	})

	Register(Entry{
		Event:    deploymentzoneevents.DeploymentZoneCreated,
		Group:    GroupDeployments,
		Object:   ObjectDeploymentZone,
		Label:    "Deployment zone created",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderEntity("Deployment zone %s was created", deploymentZonePath),
	})

	Register(Entry{
		Event:    deploymentzoneevents.DeploymentZoneDeleted,
		Group:    GroupDeployments,
		Object:   ObjectDeploymentZone,
		Label:    "Deployment zone deleted",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderOnList("Deployment zone %s was deleted", deploymentZonePath),
	})

	Register(Entry{
		Event:    componentevents.ComponentCreated,
		Group:    GroupDeployments,
		Object:   ObjectComponent,
		Label:    "Component added",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderOnList("Component %s was added", componentsPath),
	})

	// Components auto-version on release, so this is one notification per
	// component per release.
	Register(Entry{
		Event:    componentevents.ComponentUpdated,
		Group:    GroupDeployments,
		Object:   ObjectComponent,
		Label:    "Component updated",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderOnList("Component %s was updated", componentsPath),
	})

	// ── Usage and entitlements ───────────────────────────────────────────────

	Register(Entry{
		Event:    instanceevents.InstanceEntitlementUsageWarningThresholdReached,
		Group:    GroupUsage,
		Object:   ObjectInstance,
		Label:    "Entitlement near limit",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderEntitlement("%s is close to its %s limit"),
	})

	Register(Entry{
		Event:    instanceevents.InstanceEntitlementUsageReached,
		Group:    GroupUsage,
		Object:   ObjectInstance,
		Label:    "Entitlement fully used",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderEntitlement("%s has used all of its %s"),
	})

	Register(Entry{
		Event:    instanceevents.InstanceEntitlementCapExceeded,
		Group:    GroupUsage,
		Object:   ObjectInstance,
		Label:    "Entitlement limit reached",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderEntitlement("%s has reached its %s limit"),
	})

	// A fleet reported usage and the platform refused it: metering for that
	// tenant is broken until somebody looks.
	Register(Entry{
		Event:    instanceevents.EntitlementUsageReportRejected,
		Group:    GroupUsage,
		Object:   ObjectInstance,
		Label:    "Usage report rejected",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderEntitlement("A usage report from %s was rejected (%s)"),
	})

	Register(Entry{
		Event:    instanceevents.InstanceEntitlementUsagePeriodRolledOver,
		Group:    GroupUsage,
		Object:   ObjectInstance,
		Label:    "Usage period rolled over",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderEntitlement("%s started a new usage period for %s"),
	})

	// ── Licensing ────────────────────────────────────────────────────────────

	Register(Entry{
		Event:    licenseevents.LicenseCreated,
		Group:    GroupLicensing,
		Object:   ObjectLicense,
		Label:    "License created",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderEntity("License %s was created", licensesPath),
	})

	Register(Entry{
		Event:    licenseevents.LicenseUpdated,
		Group:    GroupLicensing,
		Object:   ObjectLicense,
		Label:    "License updated",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderEntity("License %s was updated", licensesPath),
	})

	Register(Entry{
		Event:    licenseevents.LicenseDeleted,
		Group:    GroupLicensing,
		Object:   ObjectLicense,
		Label:    "License deleted",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderOnList("License %s was deleted", licensesPath),
	})

	Register(Entry{
		Event:    licenseevents.LicenseEntitlementAssigned,
		Group:    GroupLicensing,
		Object:   ObjectLicense,
		Label:    "Entitlement assigned to a license",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderLicenseEntitlement("%s was assigned to %s"),
	})

	Register(Entry{
		Event:    licenseevents.LicenseEntitlementUnassigned,
		Group:    GroupLicensing,
		Object:   ObjectLicense,
		Label:    "Entitlement unassigned from a license",
		Defaults: map[Channel]bool{ChannelInApp: false},
		renderer: renderLicenseEntitlement("%s was unassigned from %s"),
	})

	// ── Security ─────────────────────────────────────────────────────────────

	// A credential was minted for an organization. On by default, and in a group
	// of its own: it is the one event here a reader would want even if they
	// wanted nothing else, because "was that us?" has to be answerable now.
	Register(Entry{
		Event:    identityevents.SystemOrganizationTokenIssued,
		Group:    GroupSecurity,
		Object:   ObjectToken,
		Label:    "Organization token issued",
		Defaults: map[Channel]bool{ChannelInApp: true},
		renderer: renderOnList("A token was issued for %s", serviceAccountsPath),
	})
}

// label is how a sentence names a resolved object: by name, by slug when the
// name is empty.
func (r Ref) label() string {
	if r.Name != "" {
		return r.Name
	}

	return r.Slug
}

// instancePayload is the subset of an instance event's payload these renderers
// read. Deliberately a few fields and every one optional: the payload was
// written by whatever version of the producer was running at the time, and a
// renderer that insists on a field turns an old row into an error page.
type instancePayload struct {
	Slug               string  `json:"slug"`
	Name               string  `json:"name"`
	Status             string  `json:"status"`
	LifecycleStage     *string `json:"lifecycleStage"`
	CustomerSlug       string  `json:"customerSlug"`
	DeploymentZoneSlug *string `json:"deploymentZoneSlug"`
	InstanceName       string  `json:"instanceName"`
	InstanceSlug       string  `json:"instanceSlug"`
	// The usage events spell their entitlement both ways: the EntitlementUsage
	// response is camelCase, the threshold and rollover events are snake_case.
	EntitlementSlug      string `json:"entitlementSlug"`
	EntitlementSlugSnake string `json:"entitlement_slug"`

	// instance is the instance the audit row names, as it exists now. Every
	// producer of these events records one, and audit_trail.instance_id is set
	// to NULL when the instance is deleted -- so nil here means there is no
	// instance page to link to any more.
	instance *Ref
}

func decodeInstance(payload []byte, instance *Ref) instancePayload {
	var decoded instancePayload
	_ = json.Unmarshal(payload, &decoded)
	decoded.instance = instance

	return decoded
}

// displayName prefers the name the payload recorded, then the instance's current
// name, then a slug, so a row carrying only one of them still reads as a
// sentence. The usage events' payloads name no instance at all; the resolved
// one is the only name they have.
func (p instancePayload) displayName() string {
	candidates := []string{p.Name, p.InstanceName}
	if p.instance != nil {
		candidates = append(candidates, p.instance.Name)
	}
	candidates = append(candidates, p.Slug, p.InstanceSlug)

	for _, candidate := range candidates {
		if candidate != "" {
			return candidate
		}
	}

	return "An instance"
}

// page is where the notification opens: the instance's page -- one of its tabs
// when tab is set -- while the instance exists. A deleted instance's events open
// its customer instead, and the instance list when the payload does not say
// whose it was.
func (p instancePayload) page(tab string) string {
	if p.instance == nil || p.instance.Slug == "" {
		if p.CustomerSlug != "" {
			return customersPath + "/" + p.CustomerSlug
		}

		return instancesPath
	}

	page := instancesPath + "/" + p.instance.Slug
	if tab != "" {
		page += "/" + tab
	}

	return page
}

func (p instancePayload) entitlement() string {
	for _, candidate := range []string{p.EntitlementSlug, p.EntitlementSlugSnake} {
		if candidate != "" {
			return candidate
		}
	}

	return "usage"
}

func renderInstance(titleFormat, bodyFormat string) Renderer {
	return func(payload []byte, refs Refs) Rendered {
		decoded := decodeInstance(payload, refs.Instance)

		rendered := Rendered{
			Title:     fmt.Sprintf(titleFormat, decoded.displayName()),
			ActionURL: decoded.page(""),
		}
		if decoded.DeploymentZoneSlug != nil && *decoded.DeploymentZoneSlug != "" {
			rendered.Body = fmt.Sprintf(bodyFormat, *decoded.DeploymentZoneSlug)
		} else if decoded.CustomerSlug != "" {
			rendered.Body = fmt.Sprintf(bodyFormat, decoded.CustomerSlug)
		}

		return rendered
	}
}

func renderInstanceStatus(payload []byte, refs Refs) Rendered {
	decoded := decodeInstance(payload, refs.Instance)

	rendered := Rendered{
		Title:     fmt.Sprintf("%s changed status", decoded.displayName()),
		ActionURL: decoded.page(""),
	}
	if decoded.Status != "" {
		rendered.Body = "Now " + decoded.Status
	}

	return rendered
}

func renderInstanceLifecycle(payload []byte, refs Refs) Rendered {
	decoded := decodeInstance(payload, refs.Instance)

	rendered := Rendered{
		Title:     fmt.Sprintf("%s changed lifecycle stage", decoded.displayName()),
		ActionURL: decoded.page(""),
	}
	if decoded.LifecycleStage != nil && *decoded.LifecycleStage != "" {
		rendered.Body = "Now " + *decoded.LifecycleStage
	}

	return rendered
}

// renderEntitlement is the usage events: they open the instance's usage tab,
// which is where the number the notification is about is shown.
func renderEntitlement(titleFormat string) Renderer {
	return func(payload []byte, refs Refs) Rendered {
		decoded := decodeInstance(payload, refs.Instance)

		return Rendered{
			Title:     fmt.Sprintf(titleFormat, decoded.displayName(), decoded.entitlement()),
			ActionURL: decoded.page(instanceEntitlementsTab),
		}
	}
}

// namedPayload is every other event's payload, reduced to what a sentence needs.
type namedPayload struct {
	Name    string `json:"name"`
	Slug    string `json:"slug"`
	Version string `json:"version"`
}

func decodeNamed(payload []byte) namedPayload {
	var decoded namedPayload
	_ = json.Unmarshal(payload, &decoded)

	return decoded
}

func (p namedPayload) displayName(fallback string) string {
	for _, candidate := range []string{p.Name, p.Version, p.Slug} {
		if candidate != "" {
			return candidate
		}
	}

	return fallback
}

func renderRelease(payload []byte, _ Refs) Rendered {
	decoded := decodeNamed(payload)

	rendered := Rendered{
		Title:     fmt.Sprintf("Release %s was published", decoded.displayName("A release")),
		ActionURL: releasesPath,
	}
	if decoded.Slug != "" {
		rendered.ActionURL = releasesPath + "/" + decoded.Slug
	}

	return rendered
}

// renderReleaseDeployed reads nothing from its payload: the deployment record is
// {id, deploymentZoneId, releaseId} and no more, so the zone and the release are
// what the feed resolved from those ids. It opens the zone, which is what
// changed -- the release was already there.
func renderReleaseDeployed(_ []byte, refs Refs) Rendered {
	zone := "a deployment zone"
	page := deploymentZonePath
	if refs.DeploymentZone != nil {
		zone = refs.DeploymentZone.label()
		page = deploymentZonePath + "/" + refs.DeploymentZone.Slug
	}

	if refs.Release != nil {
		return Rendered{
			Title:     fmt.Sprintf("Release %s was deployed to %s", refs.Release.label(), zone),
			ActionURL: page,
		}
	}

	return Rendered{Title: "A release was deployed to " + zone, ActionURL: page}
}

// licenseEntitlementPayload is what assigning or unassigning an entitlement
// records: the entitlement by name, the license only by id and slug. A license
// slug is not shown to anyone, so the license's name comes from the feed.
type licenseEntitlementPayload struct {
	EntitlementName string `json:"entitlementName"`
	EntitlementSlug string `json:"entitlementSlug"`
}

func renderLicenseEntitlement(titleFormat string) Renderer {
	return func(payload []byte, refs Refs) Rendered {
		var decoded licenseEntitlementPayload
		_ = json.Unmarshal(payload, &decoded)

		entitlement := "An entitlement"
		for _, candidate := range []string{decoded.EntitlementName, decoded.EntitlementSlug} {
			if candidate != "" {
				entitlement = candidate

				break
			}
		}

		license := "a license"
		page := licensesPath
		if refs.License != nil {
			license = refs.License.label()
			page = licensesPath + "/" + refs.License.Slug
		}

		return Rendered{Title: fmt.Sprintf(titleFormat, entitlement, license), ActionURL: page}
	}
}

// renderEntity is the shape almost every non-instance event takes: something
// with a name happened, and the link goes to that something -- its own page when
// the payload names a slug, the list it lives on otherwise.
func renderEntity(titleFormat, listPath string) Renderer {
	return func(payload []byte, _ Refs) Rendered {
		decoded := decodeNamed(payload)

		rendered := Rendered{
			Title:     fmt.Sprintf(titleFormat, decoded.displayName("An item")),
			ActionURL: listPath,
		}
		if decoded.Slug != "" {
			rendered.ActionURL = listPath + "/" + decoded.Slug
		}

		return rendered
	}
}

// renderOnList is renderEntity for an object with no page to open: one the event
// says was deleted (or never created), or one the app lists without giving it a
// page of its own. It links to the list the object lives on.
func renderOnList(titleFormat, listPath string) Renderer {
	return func(payload []byte, _ Refs) Rendered {
		decoded := decodeNamed(payload)

		return Rendered{
			Title:     fmt.Sprintf(titleFormat, decoded.displayName("An item")),
			ActionURL: listPath,
		}
	}
}
