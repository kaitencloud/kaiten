type DashboardCustomer = {
  createdAt: string;
  id: string;
  name: string;
  slug: string;
};

type DashboardLicense = {
  id: string;
  name: string;
  slug: string;
  type: string;
};

type DashboardInstance = {
  createdAt: string;
  customerId: string;
  endLicenseDate: string;
  id: string;
  license: DashboardLicense;
  licenseId: string;
  name: string;
  slug: string;
  startLicenseDate: string;
};

type DashboardData = {
  customers: DashboardCustomer[];
  instances: DashboardInstance[];
  licenses: DashboardLicense[];
};

export type SerializedDashboardAppModel = {
  data: DashboardData;
};

export class DashboardAppModel {
  private readonly data: DashboardData;

  constructor(data: DashboardData) {
    this.data = data;
  }

  static fromSerialized(state: SerializedDashboardAppModel) {
    return new DashboardAppModel(state.data);
  }

  serializeForMsw(): SerializedDashboardAppModel {
    return { data: this.data };
  }

  getDashboardData() {
    return {
      customers: { items: this.data.customers },
      instances: { items: this.data.instances },
      licenses: { items: this.data.licenses },
    };
  }
}
