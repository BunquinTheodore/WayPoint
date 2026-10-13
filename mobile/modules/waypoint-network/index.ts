import { requireNativeModule } from 'expo';
export interface WaypointNetwork {
  join(ssid: string, password: string): Promise<void>;
  download(url: string, certificatePem: string): Promise<string>;
  disconnect(): Promise<void>;
}
export default requireNativeModule<WaypointNetwork>('WaypointNetwork');
