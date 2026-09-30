package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/notifications"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/getpreferences"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/hub"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/listnotifications"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/markread"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/putpreferences"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/stream"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Notifications is the facade over a person's own feed.
//
// Every method here takes the user out of the caller rather than off the wire:
// these operations address the signed-in user's own rows and no others, so there
// is no id to pass and no way to ask for somebody else's.
type Notifications struct {
	uc *notifications.UseCases
}

func (k *Kaiten) Notifications() Notifications {
	return Notifications{uc: k.modules.Notifications}
}

func (n Notifications) ListNotifications(
	ctx context.Context, cl caller.OrganizationCaller, query listnotifications.Query,
) (schema.List, error) {
	if err := cl.Require(listnotifications.RequiredScope); err != nil {
		return schema.List{}, err
	}

	return n.uc.ListNotifications.Execute(bindOrganization(ctx, cl), cl.UserID(), cl.OrganizationID(), query)
}

func (n Notifications) MarkNotificationsRead(
	ctx context.Context, cl caller.OrganizationCaller, command markread.Command,
) (schema.MarkReadResult, error) {
	if err := cl.Require(markread.RequiredScope); err != nil {
		return schema.MarkReadResult{}, err
	}

	return n.uc.MarkRead.Execute(bindOrganization(ctx, cl), cl.UserID(), cl.OrganizationID(), command)
}

func (n Notifications) GetNotificationPreferences(
	ctx context.Context, cl caller.OrganizationCaller,
) (schema.PreferenceMatrix, error) {
	if err := cl.Require(getpreferences.RequiredScope); err != nil {
		return schema.PreferenceMatrix{}, err
	}

	return n.uc.GetPreferences.Execute(bindOrganization(ctx, cl), cl.UserID())
}

func (n Notifications) PutNotificationPreferences(
	ctx context.Context, cl caller.OrganizationCaller, updates []schema.PreferenceUpdate,
) (schema.PreferenceMatrix, error) {
	if err := cl.Require(putpreferences.RequiredScope); err != nil {
		return schema.PreferenceMatrix{}, err
	}

	return n.uc.PutPreferences.Execute(bindOrganization(ctx, cl), cl.UserID(), updates)
}

// OpenStream authorizes a stream and answers with everything its first frame
// needs: the caller's subscription and their unread count.
//
// The scope check lives here, with every other one, rather than in the SSE
// handler -- reading the feed live is reading the feed, so it requires the same
// scope as listing it.
func (n Notifications) OpenStream(
	ctx context.Context, cl caller.OrganizationCaller,
) (stream.Session, error) {
	if err := cl.Require(stream.RequiredScope); err != nil {
		return stream.Session{}, err
	}

	return n.uc.Stream.Execute(bindOrganization(ctx, cl), cl.UserID(), cl.OrganizationID())
}

// Streams is the connection registry itself, which the transport needs to
// register and drop a connection. It carries no data and answers no question
// about a caller; authorization happened in OpenStream above.
func (n Notifications) Streams() *hub.Hub { return n.uc.Hub }
