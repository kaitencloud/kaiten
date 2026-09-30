import type { Meta, StoryObj } from '@storybook/react-vite';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  StepStack,
  StepStackContainer,
  StepStackNext,
  StepStackPrevious,
  StepStackStep,
} from '@/functionals/step-stack';
import {
  StackedFormDialog,
  StackedFormDialogCard,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '../stacked-form-dialog';

const meta = {
  title: 'Functionals/StackedFormDialog',
  component: StackedFormDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StackedFormDialog>;

export default meta;
type Story = StoryObj<typeof StackedFormDialog>;

function SampleFormPanel({ dense = false }: { dense?: boolean }) {
  return (
    <>
      <StackedFormDialogFooter>
        <Button variant="outline">Cancel</Button>
        <Button className="gap-2">
          <Save className="size-4" />
          Save
        </Button>
      </StackedFormDialogFooter>
      <StackedFormDialogPanel className={dense ? 'max-w-2xl' : 'max-w-4xl'}>
        <div className={dense ? 'space-y-6' : 'grid gap-6 md:grid-cols-2'}>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" defaultValue="Enterprise Pro" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" defaultValue="enterprise-pro" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              defaultValue="Shared commercial plan used by enterprise customers."
            />
          </div>
        </div>
      </StackedFormDialogPanel>
    </>
  );
}

export const WideForm: Story = {
  render: () => (
    <StackedFormDialog
      open
      onOpenChange={() => {}}
      title="Edit license"
      description="Review contract metadata before saving changes."
    >
      <SampleFormPanel />
    </StackedFormDialog>
  ),
};

export const CompactForm: Story = {
  render: () => (
    <StackedFormDialog
      open
      confirmOnClose={false}
      onOpenChange={() => {}}
      title="Create customer"
      description="A compact form panel used by short creation flows."
    >
      <SampleFormPanel dense />
    </StackedFormDialog>
  ),
};

export const MultiplePanels: Story = {
  render: () => (
    <StackedFormDialog
      open
      onOpenChange={() => {}}
      title="Create deployment zone"
      description="Two side-by-side content sections inside the dialog body."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <StackedFormDialogPanel className="max-w-none">
          <div className="space-y-2">
            <p className="font-semibold">Identity</p>
            <p className="text-muted-foreground text-sm">
              Name, slug and ownership metadata.
            </p>
          </div>
        </StackedFormDialogPanel>
        <SampleFormPanel dense />
      </div>
    </StackedFormDialog>
  ),
};

export const WithStepStack: Story = {
  render: () => (
    <StackedFormDialog
      stacked
      open
      onOpenChange={() => {}}
      title="Create instance"
      description="Multi-step wizard with stacked cards behind the active step."
    >
      <StepStack embedded orientation="bottom-right">
        <StepStackContainer className="justify-start">
          <StepStackStep>
            <StackedFormDialogCard
              footer={
                <StepStackNext asChild>
                  <Button>Next</Button>
                </StepStackNext>
              }
            >
              <div className="space-y-6">
                <h3 className="font-semibold text-xl">Instance details</h3>
                <div className="space-y-2">
                  <Label htmlFor="instance-name">Name</Label>
                  <Input id="instance-name" defaultValue="Production EU" />
                </div>
              </div>
            </StackedFormDialogCard>
          </StepStackStep>
          <StepStackStep>
            <StackedFormDialogCard
              footer={
                <>
                  <StepStackPrevious asChild>
                    <Button variant="outline">Previous</Button>
                  </StepStackPrevious>
                  <StepStackNext asChild>
                    <Button>Save</Button>
                  </StepStackNext>
                </>
              }
            >
              <div className="space-y-6">
                <h3 className="font-semibold text-xl">Choose license</h3>
                <div className="space-y-2">
                  <Label htmlFor="license">License</Label>
                  <Input id="license" defaultValue="Enterprise Pro" />
                </div>
              </div>
            </StackedFormDialogCard>
          </StepStackStep>
        </StepStackContainer>
      </StepStack>
    </StackedFormDialog>
  ),
};
