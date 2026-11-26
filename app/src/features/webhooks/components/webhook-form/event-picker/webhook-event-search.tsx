import { SearchIcon, XIcon } from 'lucide-react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';

type WebhookEventSearchProps = {
  query: string;
  onQueryChange: (next: string) => void;
  searching: boolean;
  matchCount: number;
};

/** The picker's search: Escape clears it, Enter never sends the form. */
export function WebhookEventSearch({
  query,
  onQueryChange,
  searching,
  matchCount,
}: WebhookEventSearchProps) {
  const { t } = useTranslation();

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onQueryChange(event.target.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
    }
    if (event.key === 'Escape' && query) {
      event.preventDefault();
      onQueryChange('');
    }
  }

  function handleClear() {
    onQueryChange('');
  }

  return (
    <div>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={t('Pages.Integrations.Webhooks.Form.picker.searchLabel')}
          placeholder={t(
            'Pages.Integrations.Webhooks.Form.picker.searchPlaceholder',
          )}
          autoComplete="off"
          spellCheck={false}
        />
        {query ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              onClick={handleClear}
              aria-label={t(
                'Pages.Integrations.Webhooks.Form.picker.searchClear',
              )}
            >
              <XIcon aria-hidden />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      <p role="status" className="sr-only">
        {searching
          ? t('Pages.Integrations.Webhooks.Form.picker.searchResults', {
              count: matchCount,
            })
          : ''}
      </p>
    </div>
  );
}
