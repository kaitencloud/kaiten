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
  readError?: number;
};

export class DashboardAppModel {
  private readonly data: DashboardData;
  private readError?: number;

  setReadError(status: number) {
    this.readError = status;
  }

  constructor(data: DashboardData) {
    this.data = data;
  }

  static fromSerialized(state: SerializedDashboardAppModel) {
    const model = new DashboardAppModel(state.data);
    model.readError = state.readError;
    return model;
  }

  serializeForMsw(): SerializedDashboardAppModel {
    return { data: this.data, readError: this.readError };
  }

  getDashboardData() {
    if (this.readError)
      throw Object.assign(new Error('Dashboard unavailable'), {
        httpStatus: this.readError,
      });
    return {
      customers: { items: this.data.customers },
      instances: { items: this.data.instances },
      licenses: { items: this.data.licenses },
    };
  }
}
