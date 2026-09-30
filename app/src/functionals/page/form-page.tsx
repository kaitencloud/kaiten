type FormPageProps = {
  title: string;
  children: React.ReactNode;
};

export const FormPage = ({ title, children }: FormPageProps) => (
  <div className="lg:container mx-auto">
    <h4 className="text-3xl font-extrabold md:text-4xl">{title}</h4>
    <div className="flex flex-col mt-8">{children}</div>
  </div>
);
