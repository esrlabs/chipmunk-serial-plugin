import * as Toolkit from 'chipmunk.client.toolkit';
import { IPopup, ENotificationType } from 'chipmunk.client.toolkit';
import { EHostCommands, EHostEvents } from '../common/host.events';
import { IOptions } from '../common/interface.options';
import { Observable, Subject } from 'rxjs';
import { IPortState, IPortInfo } from '../common/interface.portinfo';
import ServiceSignatures from './service.signatures';

export interface IPort {
    connected: boolean;
    read: number;
    written: number;
    limit: number;
    sparkline_data: Array<number>;
    spying: boolean;
}

export interface IPortOther {
    color?: string;
    available?: boolean;
    openQueue?: boolean;
    messageQueue?: string[];
}

const LIMIT = 300;

export class Service extends Toolkit.APluginService {

    public state:  {[port: string]: IPortState} = {};
    public sessionPort: {[session: string]: {[port: string]: IPort}} = {};
    public chart_limit = 30;

    private _api: Toolkit.IAPI | undefined;
    private _session: string;
    private _subscriptions: { [key: string]: Toolkit.Subscription } = {};
    private _logger: Toolkit.Logger = new Toolkit.Logger(`Plugin: serial: inj_output_bot:`);
    private _popupGuid = '';
    private _subjects = {
        event: new Subject<any>(),
    };
    private _portOther: {[path: string]: IPortOther} = {};

    constructor() {
        super();
        this._subscriptions.onAPIReady = this.onAPIReady.subscribe(this._onAPIReady.bind(this));
    }

    private _onAPIReady() {
        this._api = this.getAPI();
        if (this._api === undefined) {
            this._logger.error('API not found!');
            return;
        }
        this._subscriptions.onSessionOpen = this._api.getSessionsEventsHub().subscribe().onSessionOpen(this._onSessionOpen.bind(this));
        this._subscriptions.onSessionClose = this._api.getSessionsEventsHub().subscribe().onSessionClose(this._onSessionClose.bind(this));
        this._subscriptions.onSessionChange =
            this._api.getSessionsEventsHub().subscribe().onSessionChange(this._onSessionChange.bind(this));
    }

    private _onSessionOpen() {
        this._session = this._api.getActiveSessionId();
        this._createSessionEntries();
        this.incomeMessage();
    }

    private _onSessionClose(guid: string) {
        delete this.sessionPort[guid];
    }

    private _onSessionChange(guid: string) {
        this._session = guid;
    }

    private _createSessionEntries() {
        if (this.sessionPort[this._session] === undefined) {
            this.sessionPort[this._session] = {};
        }
        this.requestPorts().then((response) => {
            this._setPortColor(response.ports);
            response.ports.forEach((port: IPortInfo) => {
                if (this.sessionPort[this._session][port.path] === undefined) {
                    this.sessionPort[this._session][port.path] = {
                        connected: false,
                        read: 0,
                        written: 0,
                        limit: 30,
                        sparkline_data: new Array<number>(LIMIT),
                        spying: false
                    };
                }
            });
        }).catch((error: Error) => {
            this.notify('Error', `Fail to get ports list due error: ${error.message}`, ENotificationType.error);
        });
    }

    private _emptyQueue(path: string) {
        if (this._portOther[path] && this._portOther[path].messageQueue) {
            this._portOther[path].messageQueue.forEach((message) => {
                this.sendMessage(message, path).catch((error: Error) => {
                    this.notify('Error', `Fail to send message due to error: ${error.message}`, ENotificationType.error);
                });
            });
        }
    }

    private _setPortColor(ports: IPortInfo[]) {
        ports.forEach((port: IPortInfo) => {
            const cDirtyPath = '\u0004' + port.path + '\u0004';
            const cSignature = ServiceSignatures.getSignature(cDirtyPath);
            if (this._portOther[port.path] === undefined) {
                this._portOther[port.path] = {};
            }
            this._portOther[port.path].color = cSignature.color;
        });
    }

    public getPortAvailable(path: string): boolean {
        if (this._portOther[path] === undefined) {
            this._portOther[path] = { available: true };
        } else if (this._portOther[path].available === undefined) {
            this._portOther[path].available = true;
        }
        return this._portOther[path].available;
    }

    public setPortAvailable(path: string, status: boolean) {
        if (this._portOther[path] === undefined) {
            this._portOther[path] = { available: status };
        } else {
            this._portOther[path].available = status;
        }
    }

    public getPortColor(path: string): string {
        if (this._portOther[path] && this._portOther[path].color) {
            return this._portOther[path].color;
        }
        return 'rgb(255,255,255)';
    }

    public getObservable(): {
        event: Observable<Function>,
    } {
        return {
            event: this._subjects.event.asObservable(),
        };
    }

    public incomeMessage() {
        if (this._subscriptions.incomeIPCHostMessage !== undefined) {
            return;
        }
        this._subscriptions.incomeIPCHostMessage = this._api.getIPC().subscribe((message: any) => {
            if (typeof message !== 'object' && message === null) {
                return;
            }
            if (message.event === EHostEvents.spyState || message.event === EHostEvents.state) {
                Object.keys(this.sessionPort).forEach((session: string) => {
                    Object.keys(this.sessionPort[session]).forEach((path: string) => {
                        this.sessionPort[session][path].sparkline_data.shift();
                        if (message.event === EHostEvents.state && message.state[path]) {
                            this.sessionPort[session][path].read += message.state[path].ioState.read;
                            this.sessionPort[session][path].sparkline_data.push(message.state[path].ioState.read);
                        } else if (message.event === EHostEvents.spyState && message.load[path]) {
                            this.sessionPort[session][path].read += message.load[path];
                            this.sessionPort[session][path].sparkline_data.push(message.load[path]);
                        }
                    });
                });
            }
            this._subjects.event.next(message);
        });
    }

    public connect(options: IOptions): Promise<void> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.open,
            options: options,
        }, this._session).then(() => {
            this.writeConfig(options);

            const cSessionPort = this.sessionPort[this._session];
            if (cSessionPort !== undefined && cSessionPort[options.path]) {
                cSessionPort[options.path].connected = true;
                cSessionPort[options.path].read = 0;
            }
            if (this._portOther[options.path] === undefined) {
                this._portOther[options.path] = {};
            }
            this._portOther[options.path].openQueue = true;
            this._emptyQueue(options.path);
        }).catch((error: Error) => {
            this.notify('error', `Failed to connect to ${options.path}: ${error.message}`, ENotificationType.error);
        });
    }

    public disconnect(path: string): Promise<any> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.close,
            path: path,
        }, this._session).then(() => {
            if (this._portOther[path] === undefined) {
                this._portOther[path] = {};
            }
            this._portOther[path].openQueue = false;
        }).catch((error: Error) => {
            this.notify('error', `Failed to disconnect from ${path}: ${error.message}`, ENotificationType.error);
        });
    }

    public requestPorts(): Promise<any> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.list,
        }, this._session).catch((error: Error) => {
            this.notify('error', `Failed to request port list: ${error.message}`, ENotificationType.error);
        });
    }

    public startSpy(options: IOptions[]): Promise<any> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.spyStart,
            options: options,
        }, this._session);
    }

    public stopSpy(options: IOptions[]): Promise<any> {
        if (options.length > 0) {
            return this._api.getIPC().request({
                stream: this._session,
                command: EHostCommands.spyStop,
                options: options,
            }, this._session).catch((error: Error) => {
                this.notify('error', `Failed to stop spying on ports: ${error.message}`, ENotificationType.error);
            });
        }
        return Promise.resolve();
    }

    public sendMessage(message: string, port: string): Promise<any> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.send,
            cmd: message,
            path: port
        }, this._session).catch((error: Error) => {
            this.notify('error', `Failed to send message to port: ${error.message}`, ENotificationType.error);
        });
    }

    public writeConfig(options: IOptions): Promise<void> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.write,
            options: options
        }, this._session).catch((error: Error) => {
            this.notify('error', `Failed to write port configuration: ${error.message}`, ENotificationType.error);
        });
    }

    public readConfig(): Promise<any> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.read,
        }, this._session).catch((error: Error) => {
            this.notify('error', `Failed to read port configuration: ${error.message}`, ENotificationType.error);
        });
    }

    public removeConfig(port: string): Promise<void> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.remove,
            port: port
        }, this._session).catch((error: Error) => {
            this.notify('error', `Failed to remove port configuration: ${error.message}`, ENotificationType.error);
        });
    }

    public removePopup() {
        this._api.removePopup(this._popupGuid);
        this._popupGuid = '';
    }

    public addPopup(popup: IPopup) {
        if (this._popupGuid) {
            this.removePopup();
        }
        this._popupGuid = this._api.addPopup(popup);
    }

    public notify(caption: string, message: string, type: ENotificationType) {
        if (this._api) {
            this._api.addNotification({
                caption: caption,
                message: message,
                options: {
                    type: type
                }
            });
        } else {
            this._logger.error('API not found!');
        }
        if (type === ENotificationType.error) {
            this._logger.error(message);
        } else if (type === ENotificationType.warning) {
            this._logger.warn(message);
        } else {
            this._logger.info(message);
        }
    }

    public getSessionID(): string {
        return this._session;
    }
}

export default (new Service());
