import * as Toolkit from 'chipmunk.client.toolkit';
import { IPopup, ENotificationType } from 'chipmunk.client.toolkit';
import { EHostCommands, EHostEvents } from '../common/host.events';
import { IOptions } from '../common/interface.options';
import { Observable, Subject } from 'rxjs';
import { IPortState, IPortInfo } from '../common/interface.portinfo';

interface IPort {
    connected: boolean;
    read: number;
    written: number;
    sparkline_limit: number;
    sparkline_data: Array<number>;
}

export class Service extends Toolkit.APluginService {

    public state:  {[port: string]: IPortState} = {};
    public sessionPort: {[session: string]: {[port: string]: IPort}} = {};
    public ports: IPortInfo[];

    private _api: Toolkit.IAPI | undefined;
    private _session: string;
    private _subscriptions: { [key: string]: Toolkit.Subscription } = {};
    private _logger: Toolkit.Logger = new Toolkit.Logger(`Plugin: serial: inj_output_bot:`);
    private _openQueue: {[port: string]: boolean} = {};
    private _messageQueue: {[port: string]: string[]} = {};
    private _popupGuid: string;
    private _subjects = {
        event: new Subject<any>(),
    };

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
        this.requestPorts().then(resolve => {
            Object.assign(this.ports = resolve.ports);
            this.ports.forEach((port: IPortInfo) => {
                if (this.sessionPort[this._session][port.path] === undefined) {
                    this.sessionPort[this._session][port.path] = {
                        connected: false,
                        read: 0,
                        sparkline_data: new Array<number>(300),
                        sparkline_limit: 0,
                        written: 0
                    };
                }
            });
        }).catch((error: Error) => {
            this.notify('Error', `Fail to get ports list due error: ${error.message}`, ENotificationType.error);
        });
    }

    public getObservable(): {
        event: Observable<any>,
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
            if (message.streamId !== this._session && message.streamId !== '*') {
                return;
            }
            if (message.event === EHostEvents.spyState || message.event === EHostEvents.state) {
                Object.keys(this.sessionPort).forEach((session: string) => {
                    Object.keys(this.sessionPort[session]).forEach((path: string) => {
                        if (message.event === EHostEvents.state && message.state[path]) {
                            this.sessionPort[session][path].read += message.state[path].ioState.read;
                        } else if (message.event === EHostEvents.spyState && message.load[path]) {
                            this.sessionPort[session][path].read += message.load[path];
                        }
                    });
                });
            }
            this._subjects.event.next(message);
        });
    }

    private _emptyQueue(port: string) {
        if (this._messageQueue[port]) {
            this._messageQueue[port].forEach((message) => {
                this.sendMessage(message, port);
            });
        }
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
            this._openQueue[options.path] = true;
            this._emptyQueue(options.path);
        }).catch((error: Error) => {
            this.notify('error', `Failed to connect to ${options.path}: ${error.message}`, ENotificationType.error);
        });
    }

    public disconnect(port: string): Promise<any> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.close,
            path: port,
        }, this._session).then(() => {
            this._openQueue[port] = false;
            delete this.sessionPort[this._session][port];
        }).catch((error: Error) => {
            this.notify('error', `Failed to disconnect from ${port}: ${error.message}`, ENotificationType.error);
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
        }, this._session).catch((error: Error) => {
            this.notify('error', `Failed to start spying on ports: ${error.message}`, ENotificationType.error);
        });
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
    }

    public addPopup(popup: IPopup) {
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

    // public setSparklineOptions(session: string, path: string, data: Array<number>, limit: number) {
    //     if (this._sparklineOptions[session] === undefined) {
    //         this._sparklineOptions[session] = {};
    //     }
    //     this._sparklineOptions[session][path] = {spark_data: data, spark_labels: limit};
    // }

    // public getSparklineOptions(session: string, path: string): ISparkline {
    //     if (this._sparklineOptions[session] === undefined) {
    //         return {spark_data: new Array<number>(this._sparkline_limit), spark_labels: null};
    //     }
    //     return this._sparklineOptions[session][path];
    // }

    // public setSparklineLimit(limit: number) {
    //     this._sparkline_limit = limit;
    // }
}

export default (new Service());
