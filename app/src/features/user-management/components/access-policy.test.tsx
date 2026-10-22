import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import '@/lib/i18n/config';
import { AccessPage } from './access-page';
import type { ManagedUser, Role } from '@/api-client';

const policy = vi.hoisted(() => ({ scopes: [] as string[], users: [] as ManagedUser[], roles: [] as Role[], userCanWrite: false, roleCanWrite: false }));
vi.mock('@/domains/access-management', async importOriginal => {
 const actual = await importOriginal<typeof import('@/domains/access-management')>();
 return { ...actual, useCurrentAccess: () => ({data:{scopes:policy.scopes,user:{id:'actor',authorization:{enabled:true,roles:['custom']}},availablePermissions:['read:users','write:users','read:customers']},isSuccess:true,isPending:false,isError:false,error:null}) };
});
vi.mock('../user-management.queries', () => ({allUsersOptions:()=>({queryKey:['users'],initialData:{items:policy.users},queryFn:()=>Promise.resolve({items:policy.users})}),rolesOptions:()=>({queryKey:['roles'],initialData:policy.roles,queryFn:()=>Promise.resolve(policy.roles)})}));
vi.mock('./user-editor', () => ({UserEditor:({canWrite}:{canWrite:boolean})=>{policy.userCanWrite=canWrite;return <div data-testid="user-editor">{canWrite?'write':'read'}</div>}}));
vi.mock('./role-editor', () => ({RoleEditor:({canWrite}:{canWrite:boolean})=>{policy.roleCanWrite=canWrite;return <div data-testid="role-editor">{canWrite?'write':'read'}</div>}}));
vi.mock('./access-tables', () => ({UsersTable:()=> <div>Directory</div>,RolesTable:()=> <div>Roles</div>}));
const administrator:Role={slug:'administrator',name:'Administrator',description:'',permissions:['write:*'],builtIn:true,isAdministrator:true};
const support:Role={slug:'support',name:'Support',description:'',permissions:['read:customers'],builtIn:false,isAdministrator:false};
const user:ManagedUser={id:'target',name:'Target',externalId:'target-provider',email:'target@example.com',createdAt:'2026-10-22T00:00:00Z',authorization:{enabled:true,roles:['support'],permissions:[]}};
function show(manageUser?:string,manageRole?:string){return render(<QueryClientProvider client={new QueryClient()}><AccessPage search={{tab:manageRole?'roles':'users',manageUser,manageRole}} onSearchChange={()=>{}} /></QueryClientProvider>)}
beforeEach(()=>{policy.users=[user];policy.roles=[administrator,support];policy.scopes=[];policy.userCanWrite=false;policy.roleCanWrite=false});
describe('console scope-policy wiring',()=>{
 it('opens directories for custom readers without write controls',()=>{policy.scopes=['read:users'];show('target');expect(screen.getByText('Directory')).toBeVisible();expect(screen.getByTestId('user-editor')).toHaveTextContent('read')});
 it('lets custom writers manage covered users',()=>{policy.scopes=['write:users','read:customers'];show('target');expect(screen.getByTestId('user-editor')).toHaveTextContent('write')});
 it('keeps disabled higher-privilege targets read-only',()=>{policy.scopes=['write:users','read:customers'];policy.users=[{...user,authorization:{enabled:false,roles:['administrator'],permissions:[]}}];show('target');expect(screen.getByTestId('user-editor')).toHaveTextContent('read')});
 it('cannot edit a shared role assigned to a higher-privilege user',()=>{policy.scopes=['write:users','read:customers'];policy.users=[{...user,authorization:{enabled:true,roles:['administrator','support'],permissions:[]}}];show(undefined,'support');expect(screen.getByTestId('role-editor')).toHaveTextContent('read')});
 it('removes write capability after current grants are revoked',()=>{policy.scopes=['read:users'];show('target');expect(policy.userCanWrite).toBe(false)});
});
