import { useState, type FormEvent } from 'react';
import { useCreateCompany, useUpdateCompany } from '../api/hooks';
import type { CompanyDetail } from '../api/types';
import { Button } from './ui/Button';
import { Alert, errorText } from './ui/feedback';
import { Checkbox, Field, Input, Textarea } from './ui/fields';
import { Modal } from './ui/Modal';

/** Adds a company, or edits one. The same fields either way. */
export function CompanyDialog({
  open,
  company,
  onClose,
  onCreated,
}: {
  open: boolean;
  company?: CompanyDetail;
  onClose: () => void;
  onCreated?: (id: number) => void;
}) {
  const [name, setName] = useState(company?.name ?? '');
  const [website, setWebsite] = useState(company?.website ?? '');
  const [isAgency, setIsAgency] = useState(company?.isAgency ?? false);
  const [about, setAbout] = useState(company?.about ?? '');
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const saving = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const save = (event: FormEvent) => {
    event.preventDefault();
    const changes = {
      name: name.trim(),
      website: website.trim() || null,
      isAgency,
      about: about.trim() || null,
    };
    if (company) {
      update.mutate({ id: company.id, changes }, { onSuccess: onClose });
    } else {
      create.mutate(changes, {
        onSuccess: (created) => {
          onCreated?.(created.id);
          onClose();
        },
      });
    }
  };

  return (
    <Modal
      open={open}
      title={company ? `Edit ${company.name}` : 'Add a company'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="company-form" variant="primary" loading={saving}>
            {company ? 'Save' : 'Add company'}
          </Button>
        </>
      }
    >
      <form id="company-form" onSubmit={save} className="flex flex-col gap-4">
        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Website" hint="The full address, including https://.">
          {(id) => (
            <Input
              id={id}
              type="url"
              placeholder="https://acme.example"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          )}
        </Field>
        <Checkbox
          label="A recruitment agency rather than an employer"
          checked={isAgency}
          onChange={(event) => setIsAgency(event.target.checked)}
        />
        <Field label="About" hint="What you know about them. Markdown works.">
          {(id) => (
            <Textarea
              id={id}
              rows={4}
              value={about}
              onChange={(event) => setAbout(event.target.value)}
            />
          )}
        </Field>
        {error && <Alert>{errorText(error)}</Alert>}
      </form>
    </Modal>
  );
}
