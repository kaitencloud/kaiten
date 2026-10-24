import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import type { MetadataFieldDescriptor } from '@/functionals/metadata-fields';
import { initialInstanceFormValues } from '../../../utils/instance-form.shared';
import {
  INSTANCE_RECOVERY_STEPS,
  instanceRecovery,
  isSecretMetadata,
} from '../instance-recovery';

const field = (
  key: string,
  jsonSchema: MetadataFieldDescriptor['jsonSchema'],
): MetadataFieldDescriptor =>
  ({ key, jsonSchema }) as unknown as MetadataFieldDescriptor;

describe('the recovery descriptor of the instance creation', () => {
  it('pins the identity of what is stored, and its steps', () => {
    expect(instanceRecovery.formId).toBe('instances.create');
    expect(instanceRecovery.version).toBe(1);
    expect(instanceRecovery.steps).toEqual(INSTANCE_RECOVERY_STEPS);
  });

  it('names every field of the form, and puts each on a step', () => {
    const fields = Object.keys(initialInstanceFormValues).sort();
    expect(Object.keys(instanceRecovery.fieldLabels ?? {}).sort()).toEqual(
      fields,
    );
    expect(
      Object.values(instanceRecovery.stepFields ?? {})
        .flat()
        .sort(),
    ).toEqual(fields);
  });

  it('keeps a metadata value off the device until its field is known to be no secret', () => {
    const fields = [
      field('region', { type: 'string' }),
      field('apiToken', { type: 'string', format: 'password' }),
      field('seed', { type: 'string', writeOnly: true }),
    ];
    expect(isSecretMetadata(['name'], undefined)).toBe(false);
    expect(isSecretMetadata(['metadata', 'region'], undefined)).toBe(true);
    expect(isSecretMetadata(['metadata', 'region'], fields)).toBe(false);
    expect(isSecretMetadata(['metadata', 'apiToken'], fields)).toBe(true);
    expect(isSecretMetadata(['metadata', 'seed'], fields)).toBe(true);
    expect(isSecretMetadata(['metadata', 'undeclared'], fields)).toBe(true);
  });

  // The schema derives from the generated one of the API: a change of the contract
  // moves this snapshot, which is the cue to ask whether `version` must be raised,
  // since a stored input is read back through it.
  it('stores values of the shape its schema describes', () => {
    expect(
      z.toJSONSchema(instanceRecovery.schema!, {
        io: 'input',
        unrepresentable: 'any',
      }),
    ).toMatchSnapshot();
  });
});
