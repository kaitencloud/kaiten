import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vite-plus/test';
import '@/lib/i18n/config';
import { AccessConfirmation } from './access-confirmation';
import { AccessSummary } from './access-summary';
import { UserEditor } from './user-editor';
import { RoleEditor } from './role-editor';
import type { ManagedUser, Role } from '@/api-client';

const mutation = vi.hoisted(() => ({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) }));
vi.mock('../user-management.queries', () => ({useAccessMutations: () => ({profile:mutation,authorization:mutation,enabled:mutation,role:mutation,deleteRole:mutation})}));
const roles: Role[] = [{slug:'support',name:'Support',description:'Customer support',permissions:['read:customers'],builtIn:false,isAdministrator:false}];
const member: ManagedUser = {id:'person',externalId:'external-person',name:'Alex',email:'alex@example.com',createdAt:'2026-10-22T00:00:00Z',authorization:{enabled:true,roles:['support'],permissions:[]}};
function wrap(element: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient()}>{element}</QueryClientProvider>); }

describe('form refinement safety and clarity', () => {
 it('uses a specific non-destructive confirmation for access updates', () => {
  wrap(<AccessConfirmation open title="Update access?" description="Review changes" confirmLabel="Update access" pending={false} onCancel={()=>{}} onConfirm={()=>{}} />);
  expect(screen.getByRole('button',{name:'Update access'})).toHaveAttribute('data-variant','default');
 });
 it('explains full administrator authority instead of counting a wildcard', () => {
  wrap(<AccessSummary slugs={['administrator']} permissions={[]} roles={[{slug:'administrator',name:'Administrator',description:'',permissions:['write:*'],builtIn:true,isAdministrator:true}]} available={['read:customers']} />);
  expect(screen.getByText('Full administrator access')).toBeVisible();
 });
 it('protects unsaved profile edits when the user drawer is closed', async () => {
  const user=userEvent.setup(),close=vi.fn();
  wrap(<UserEditor user={member} roles={roles} available={['read:customers']} onClose={close} />);
  await user.type(await screen.findByRole('textbox',{name:'Name'}),' changed');
  await user.click(screen.getByRole('button',{name:'Close'}));
  expect(await screen.findByRole('alertdialog')).toBeVisible();
  expect(close).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'Discard changes'}));
  expect(close).toHaveBeenCalledOnce();
 });
 it('does not dismiss the user drawer while a save is pending', async () => {
  mutation.isPending=true;
  try {
   const user=userEvent.setup(),close=vi.fn();
   wrap(<UserEditor user={member} roles={roles} available={[]} onClose={close} />);
   await screen.findByRole('textbox',{name:'Name'});
   expect(screen.getByRole('button',{name:'Close'})).toBeDisabled();
   await user.keyboard('{Escape}');
   expect(close).not.toHaveBeenCalled();
  } finally { mutation.isPending=false; }
 });
 it('marks email required and enables email keyboard semantics', async () => {
  wrap(<UserEditor user={member} roles={roles} available={[]} onClose={()=>{}} />);
  const email=await screen.findByRole('textbox',{name:'Email'});
  expect(email).toHaveAttribute('type','email');
  expect(email).toHaveAttribute('inputmode','email');
  expect(email).toHaveAttribute('aria-required','true');
 });
 it('shows immutable role identifier as metadata, not a misaligned disabled input', async () => {
  wrap(<RoleEditor role={roles[0]} available={['read:customers']} assignedCount={2} onClose={()=>{}} />);
  await screen.findByRole('textbox',{name:'Name'});
  expect(screen.queryByRole('textbox',{name:'Role identifier'})).not.toBeInTheDocument();
  expect(screen.getByText('support',{exact:true})).toBeVisible();
  expect(screen.getByText('Changes affect 2 assigned users')).toBeVisible();
 });
 it('keeps unsaved profile edits after saving access', async () => {
  const user=userEvent.setup(),close=vi.fn();mutation.mutateAsync.mockClear();
  wrap(<UserEditor user={member} roles={roles} available={['read:customers']} onClose={close} />);
  await user.type(await screen.findByRole('textbox',{name:'Name'}),' changed');
  await user.click(screen.getByRole('button',{name:'Save access'}));
  await user.click(screen.getByRole('alertdialog').querySelector('button[data-variant="default"]')!);
  await waitFor(()=>expect(mutation.mutateAsync).toHaveBeenCalled());
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox',{name:'Name'})).toHaveValue('Alex changed');
 });
});
