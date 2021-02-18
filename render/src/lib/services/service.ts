import * as Toolkit from 'chipmunk.client.toolkit';
import { IPopup, ENotificationType } from 'chipmunk.client.toolkit';
import { EHostCommands, EHostEvents } from '../common/host.events';
import { IOptions } from '../common/interface.options';
import { Observable, Subject } from 'rxjs';
import { IPortInfo } from '../common/interface.portinfo';
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

enum EValidationError {
    NO_ERROR = 0,
    NOT_VALID_SESSION = 1000,
    NOT_VALID_PATH = 1001,
    NOT_VALID_READ = 1002,
    NOT_VALID_ENTRY = 1003
}

interface IPluginSettings {
    recent: IPortConfig;
    commands: string[];
}

export enum EType {
    command = 'command',
    options = 'options'
}

export interface IPortConfig {
    settings: {[path: string]: IOptions};
}

export class Service extends Toolkit.APluginService {

    private _api: Toolkit.IAPI | undefined;
    private _session: string;
    private _subscriptions: { [key: string]: Toolkit.Subscription } = {};
    private _logger: Toolkit.Logger = new Toolkit.Logger(`Plugin: serial: inj_output_bot:`);
    private _popupGuid = '';
    private _subjects = {
        event: new Subject<any>(),
    };
    private _sessionPort: {[session: string]: {[port: string]: IPort}} = {};
    private _portOther: {[path: string]: IPortOther} = {};
    private _chartLimit = 30;
    private _limit = 300;
    private _sessions: string[] = [];
    private _configSettings: {[path: string]: IOptions} | undefined = {};
    private _configCommands: string[] = [];

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
        if (this._session !== undefined) {
            this._sessions.push(this._session);
        } else {
            this._session = '*';
        }
        this.readConfig().then((configuration: IPluginSettings) => {
            if (configuration && configuration['settings']) {
                if (configuration['settings'].recent) {
                    this._configSettings = configuration['settings'].recent;
                }
                if (configuration['settings'].commands) {
                    this._configCommands = configuration['settings'].commands;
                }
            }
            this._createSessionEntries(this._session);
        }).catch((error: Error) => {
            this._logger.warn(`An error occured when reading the configuration file: ${error.message}`);
        });
        this.incomeMessage();
    }

    private _onSessionClose(session: string) {
        const INDEX = this._sessions.indexOf(session);
        if (INDEX !== -1) {
            this._sessions.splice(INDEX);
        }
        this.deleteSessionEntry(session);
    }

    private _onSessionChange(session: string) {
        this._session = session;
    }

    private _createSessionEntries(session: string) {
        if (this._sessionPort[session] === undefined) {
            this._sessionPort[session] = {};
        }
        this.requestPorts(session).then((response) => {
            this._setPortColor(response.ports);
            response.ports.forEach((port: IPortInfo) => {
                if (this.getSessionPort(session, port.path) === undefined) {
                    this._sessionPort[session][port.path] = {
                        connected: false,
                        read: 0,
                        written: 0,
                        limit: 30,
                        sparkline_data: new Array<number>(this._limit),
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
                Object.keys(this._sessionPort).forEach((session: string) => {
                    Object.keys(this._sessionPort[session]).forEach((path: string) => {
                        this._sessionPort[session][path].sparkline_data.shift();
                        if (message.event === EHostEvents.state && message.state[path]) {
                            this._sessionPort[session][path].read += message.state[path].ioState.read;
                            this._sessionPort[session][path].sparkline_data.push(message.state[path].ioState.read);
                        } else if (message.event === EHostEvents.spyState && message.load[path]) {
                            this._sessionPort[session][path].read += message.load[path];
                            this._sessionPort[session][path].sparkline_data.push(message.load[path]);
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
            this.writeConfig(EType.options, options);

            const cSessionPort = this._sessionPort[this._session];
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

    public requestPorts(session?: string): Promise<any> {
        if (session === undefined) {
            session = this._session;
        }
        return this._api.getIPC().request({
            stream: session,
            command: EHostCommands.list,
        }, session).catch((error: Error) => {
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

    public sendMessage(message: string, path: string): Promise<any> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.send,
            cmd: message,
            path: path
        }, this._session).then(() => {
            if (this._configCommands.indexOf(message) === -1) {
                this._configCommands.push(message);
            }
            this.writeConfig(EType.command, message);
        }).catch((error: Error) => {
            this.notify('error', `Failed to send message to port: ${error.message}`, ENotificationType.error);
        });
    }

    public writeConfig(type: EType, data: IOptions | string): Promise<void> {
        return this._api.getIPC().request({
            stream: this._session,
            command: EHostCommands.write,
            type: type,
            data: data
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

    public getChartLimit(): number {
        return this._chartLimit;
    }

    public setChartLimit(limit: number) {
        if (typeof limit !== 'number' || limit < 0) {
            this._logger.warn('There seems to be an issue with the chart limit');
            return;
        }
        this._chartLimit = limit;
    }

    private _check(session?: string, path?: string, read?: number): EValidationError {
        if (session && (typeof session !== 'string' || session.trim() === '')) {
            this._logger.warn('Wrong session format when accessing sessionPort!');
            return EValidationError.NOT_VALID_SESSION;
        }
        if (path && (typeof path !== 'string' || path.trim() === '')) {
            this._logger.warn('Wrong path format when accessing sessionPort!');
            return EValidationError.NOT_VALID_PATH;
        }
        if (read && typeof read !== 'number') {
            this._logger.warn('Wrong format for read');
            return EValidationError.NOT_VALID_READ;
        }
        if (this._sessionPort[session] === undefined || this._sessionPort[session][path] === undefined) {
            this._logger.warn(`The session ${session} has no entry for ${path} in sessionPort!`);
            return EValidationError.NOT_VALID_ENTRY;
        }
        return EValidationError.NO_ERROR;
    }

    public getSessionPort(session: string, path: string): IPort | undefined {
        if (this._check(session, path) !== EValidationError.NO_ERROR) {
            return undefined;
        }
        return Object.assign({}, this._sessionPort[session][path]);
    }

    public setSessionPortRead(session: string, path: string, read: number) {
        if (this._check(session, path, read) !== EValidationError.NO_ERROR) {
            return;
        }
        if (this._sessionPort[session][path].read === undefined) {
            this._sessionPort[session][path].read = 0;
        }
        this._sessionPort[session][path].read += read;
    }

    public updateSparkline(session: string, path: string, read: number) {
        if (this._check(session, path, read) !== EValidationError.NO_ERROR) {
            return;
        }
        if (this._sessionPort[session][path].sparkline_data === undefined) {
            this._logger.warn(`The session ${session} has no sparkline data for the port ${path} stored!`);
            return;
        }
        this._sessionPort[session][path].sparkline_data.pop();
        this._sessionPort[session][path].sparkline_data.unshift(read);
    }

    public deleteSessionEntry(session: string) {
        if (this._check(session) !== EValidationError.NO_ERROR) {
            return;
        }
        delete this._sessionPort[session];
    }

    public deletePortEntry(session: string, path: string) {
        if (this._check(session, path) !== EValidationError.NO_ERROR) {
            return;
        }
        delete this._sessionPort[session][path];
    }

    public getSessions(): string[] | undefined {
        return Object.assign([], this._sessions);
    }

    public getSettings(path: string): IOptions | undefined {
        if (this._configSettings !== undefined && this._configSettings[path] !== undefined) {
            return Object.assign({}, this._configSettings[path]);
        }
        return undefined;
    }

    public getCommands(): string[] {
        return this._configCommands.slice();
    }
}

export default (new Service());
