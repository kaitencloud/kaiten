import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  StepStack,
  StepStackContainer,
  StepStackNext,
  type StepStackOrientation,
  StepStackPrevious,
  StepStackStep,
} from '..';

const meta = {
  title: 'Functionals/StepStack',
  component: StepStack,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StepStack>;

export default meta;
type Story = StoryObj<typeof StepStack>;

function OrientationDemo({
  orientation,
}: {
  orientation: StepStackOrientation;
}) {
  return (
    <div className="w-[700px] p-8">
      <StepStack orientation={orientation}>
        <StepStackContainer className="min-h-[420px] justify-start">
          <StepStackStep>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 1</h3>
              <p className="text-sm text-muted-foreground">
                Orientation: {orientation}
              </p>
              <div className="flex justify-end">
                <StepStackNext asChild>
                  <Button>Next</Button>
                </StepStackNext>
              </div>
            </div>
          </StepStackStep>
          <StepStackStep>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 2</h3>
              <p className="text-sm text-muted-foreground">
                Previous steps should stack behind.
              </p>
              <div className="flex justify-between">
                <StepStackPrevious asChild>
                  <Button variant="outline">Previous</Button>
                </StepStackPrevious>
                <StepStackNext asChild>
                  <Button>Next</Button>
                </StepStackNext>
              </div>
            </div>
          </StepStackStep>
          <StepStackStep>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 3</h3>
              <div className="flex justify-between">
                <StepStackPrevious asChild>
                  <Button variant="outline">Previous</Button>
                </StepStackPrevious>
                <Button>Finish</Button>
              </div>
            </div>
          </StepStackStep>
        </StepStackContainer>
      </StepStack>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <div className="w-[500px] p-8">
      <StepStack>
        <StepStackContainer>
          <StepStackStep>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 1: Personal Info</h3>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="Enter your name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="Enter your email" />
              </div>
              <div className="flex justify-end">
                <StepStackNext asChild>
                  <Button>Next</Button>
                </StepStackNext>
              </div>
            </div>
          </StepStackStep>

          <StepStackStep>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 2: Address</h3>
              <div className="space-y-2">
                <Label htmlFor="street">Street</Label>
                <Input id="street" placeholder="Enter your street" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" placeholder="Enter your city" />
              </div>
              <div className="flex justify-between">
                <StepStackPrevious asChild>
                  <Button variant="outline">Previous</Button>
                </StepStackPrevious>
                <StepStackNext asChild>
                  <Button>Next</Button>
                </StepStackNext>
              </div>
            </div>
          </StepStackStep>

          <StepStackStep>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 3: Confirmation</h3>
              <p className="text-sm text-muted-foreground">
                Please review your information and confirm.
              </p>
              <div className="flex justify-between">
                <StepStackPrevious asChild>
                  <Button variant="outline">Previous</Button>
                </StepStackPrevious>
                <Button>Submit</Button>
              </div>
            </div>
          </StepStackStep>
        </StepStackContainer>
      </StepStack>
    </div>
  ),
};

export const Clickable: Story = {
  render: () => (
    <div className="w-[500px] p-8">
      <StepStack clickable>
        <StepStackContainer>
          <StepStackStep>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 1</h3>
              <p className="text-sm text-muted-foreground">
                Click on previous steps to go back
              </p>
              <div className="flex justify-end">
                <StepStackNext asChild>
                  <Button>Next</Button>
                </StepStackNext>
              </div>
            </div>
          </StepStackStep>

          <StepStackStep>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 2</h3>
              <p className="text-sm text-muted-foreground">
                Try clicking on the previous step card
              </p>
              <div className="flex justify-between">
                <StepStackPrevious asChild>
                  <Button variant="outline">Previous</Button>
                </StepStackPrevious>
                <StepStackNext asChild>
                  <Button>Next</Button>
                </StepStackNext>
              </div>
            </div>
          </StepStackStep>

          <StepStackStep>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 3</h3>
              <p className="text-sm text-muted-foreground">Final step</p>
              <div className="flex justify-between">
                <StepStackPrevious asChild>
                  <Button variant="outline">Previous</Button>
                </StepStackPrevious>
                <Button>Finish</Button>
              </div>
            </div>
          </StepStackStep>
        </StepStackContainer>
      </StepStack>
    </div>
  ),
};

export const OrientationRight: Story = {
  render: () => <OrientationDemo orientation="right" />,
};

export const OrientationTopRight: Story = {
  render: () => <OrientationDemo orientation="top-right" />,
};

export const OrientationBottomRight: Story = {
  render: () => <OrientationDemo orientation="bottom-right" />,
};
