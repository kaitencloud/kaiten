import { describe, expect, it } from 'vite-plus/test';
import { ApiError } from '@/lib/errors/api-error';
import {
  accessErrorMessage, changePermissionLevel, effectivePermissions,
  filterUsers, parseAccessSearch, permissionLevel, roleSchema,
} from './access-helpers';
import type { ManagedUser } from '@/api-client';

const scopes = ['read:customers', 'write:customers', 'read:users'];
const member: ManagedUser = {
 id: 'user-1', externalId: 'provider-1', name: 'Alex Rivera', email: 'alex@example.com',
 createdAt: '2026-10-22T00:00:00Z', authorization: { enabled: true, roles: ['support'], permissions: [] },
};
describe('access management', () => {
 it('normalizes route filters without trusting invalid values', () => {
  expect(parseAccessSearch({ tab:'unknown',status:'invalid',q:'',manageUser:123 })).toEqual({tab:'users',status:undefined,q:undefined,manageUser:undefined,manageRole:undefined,createRole:undefined});
  expect(parseAccessSearch({tab:'roles',manageRole:'new'}).manageRole).toBe('new');
 expect(parseAccessSearch({tab:'roles',createRole:'true'}).createRole).toBe(true);
 });
 it('changes only direct permissions and respects offered scopes', () => {
  expect(changePermissionLevel(['read:users'],'customers','write',scopes)).toEqual(['read:customers','read:users','write:customers']);
  expect(changePermissionLevel(['read:users','write:customers'],'customers','none',scopes)).toEqual(['read:users']);
  expect(permissionLevel(['write:customers'],'customers')).toBe('write');
 });
 it('keeps inherited scopes visible even with no direct grants', () => {
  expect(effectivePermissions(['support'], [], [{slug:'support',name:'Support',description:'',permissions:['read:customers'],builtIn:false,isAdministrator:false}])).toEqual(['read:customers']);
 });
 it('matches users by identity/email and current status', () => {
  expect(filterUsers([member],{tab:'users',q:'ALEX'})).toHaveLength(1);
  expect(filterUsers([member],{tab:'users',status:'disabled'})).toHaveLength(0);
 });
 it('validates custom role identifiers against the API contract', () => {
  expect(roleSchema.safeParse({slug:'1support',name:'Support',description:'',permissions:[]}).success).toBe(false);
  expect(roleSchema.safeParse({slug:'support',name:'Support',description:'',permissions:[]}).success).toBe(true);
 });
 it('explains last-administrator refusals without raw server details', () => {
  expect(accessErrorMessage(new ApiError({status:409,data:{code:'Users.LastAdministrator'}}),key=>key)).toBe('Pages.Access.errors.LastAdministrator');
 });
});
