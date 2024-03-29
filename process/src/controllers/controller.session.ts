import Logger from "../env/env.logger";
import { IOptions } from "./controller.serialport";
import ServicePorts from "../services/service.ports";
import PluginIPCService from "chipmunk.plugin.ipc";
import { ERenderEvents } from "../consts/events";

export interface IPortChunk {
  chunk: string;
  port: string;
}

export interface IPortError {
  error: Error;
  port: string;
}

const PSEUDO_SESSION = `*`;

export class ControllerSession {
  private _session: string;
  private _ports: string[] = [];
  private _logger: Logger;
  private _readLoad: { [key: string]: number } = {};

  constructor(session: string) {
    this._session = session;
    this._logger = new Logger(`ControllerSession: ${session}`);
  }

  public destroy(): Promise<void> {
    return new Promise((resolve) => {
      if (this._ports.length === 0) {
        return resolve();
      }
      Promise.all(
        this._ports.map((port: string) => {
          return new Promise((resolveUnrefPort) => {
            ServicePorts.unrefPort(this._session, port)
              .catch((errorUnrefPort: Error) => {
                this._logger.error(
                  `Error while unrefing port: ${errorUnrefPort.message}`
                );
              })
              .finally(() => {
                resolveUnrefPort();
              });
          });
        })
      ).finally(resolve);
    });
  }

  public open(options: IOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof options !== "object" || options === null) {
        return reject(
          new Error(
            this._logger.error(
              `Options should be object. Gotten type: "${typeof options}"`
            )
          )
        );
      }
      if (typeof options.path !== "string" || options.path.trim() === "") {
        return reject(new Error(this._logger.error(`Wrong "path" defition`)));
      }
      if (this._isPortRefed(options.path)) {
        return reject(
          new Error(
            this._logger.error(
              `Port "${options.path}" is already assigned with session "${this._session}"`
            )
          )
        );
      }
      ServicePorts.refPort(this._session, options, {
        onData: this._onPortData.bind(this, options.path),
        onError: this._onPortError.bind(this, options.path),
        onDisconnect: this._onPortDisconnect.bind(this, options.path),
      })
        .then(() => {
          this._logger.env(
            `Port "${options.path}" is assigned with session "${this._session}"`
          );
          // Save data
          this._ports.push(options.path);
          // Notify render
          PluginIPCService.sendToPluginHost(this._session, {
            event: ERenderEvents.connected,
            streamId: this._session,
            port: options.path,
          }).catch((error: Error) => {
            this._logger.error(
              `Fail to notify host about connection due error: ${error.message}`
            );
          });
          resolve();
        })
        .catch((openErr: Error) => {
          reject(
            new Error(
              this._logger.error(
                `Fail to open port "${options.path}" due error: ${openErr.message}`
              )
            )
          );
        });
    });
  }

  public close(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._isPortRefed(path)) {
        return reject(
          new Error(
            this._logger.error(
              `Port "${path}" isn't assigned with session "${this._session}"`
            )
          )
        );
      }
      ServicePorts.unrefPort(this._session, path)
        .catch((error: Error) => {
          this._logger.error(
            `Fail unref normally port "${path}" from session "${this._session}" due error: ${error.message}`
          );
        })
        .finally(() => {
          this._removePort(path);
          resolve();
        });
    });
  }

  public spyStart(options: IOptions[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this._readLoad = {};
      Promise.all(
        options.map((option: IOptions) => {
          return ServicePorts.refPort(PSEUDO_SESSION, option, {
            onData: this._readSpyLoad.bind(this, option.path),
            onError: this._onPortError.bind(this, option.path),
            onDisconnect: this._onSpyPortDisconnect.bind(this, option.path),
          }).then(() => this._logger.env("Starting spying on: " + option.path));
        })
      )
        .then(() => {
          this._logger.env(`Spying has started for all ports`);
        })
        .catch((openErr: Error) => {
          reject(
            new Error(
              this._logger.error(
                `Failed to start spying on ports due to error: ${openErr.message}`
              )
            )
          );
        })
        .finally(resolve);
    });
  }

  public spyStop(options: IOptions[]): Promise<void> {
    return new Promise((resolve, reject) => {
      Promise.all(
        options.map((option: IOptions) => {
          return ServicePorts.unrefPort(PSEUDO_SESSION, option.path)
            .then(() => {
              this._logger.env("Stopping spying on: " + option.path);
            })
            .catch((error: Error) => {
              this._logger.error(
                `Failed to unref normally port "${option.path}" while spying due to error: ${error.message}`
              );
            });
        })
      )
        .then(() => {
          this._logger.env(`Ports no longer being spied on`);
        })
        .catch((openErr: Error) => {
          reject(
            new Error(
              this._logger.error(
                `Failed to stop spying to due error: ${openErr.message}`
              )
            )
          );
        })
        .finally(resolve);
    });
  }

  private _readSpyLoad(port: string, chunk: Buffer) {
    if (this._readLoad[port] === undefined) {
      this._readLoad[port] = 0;
    }
    this._readLoad[port] = chunk.length;
    PluginIPCService.sendToPluginHost(this._session, {
      event: ERenderEvents.spyState,
      streamId: this._session,
      load: this._readLoad,
    }).catch((error: Error) => {
      this._logger.error(
        `Failed to read spy load of port ${port} due error: ${error.message}`
      );
    });
  }

  private _onPortData(port: string, chunk: Buffer) {
    PluginIPCService.sendToStream(chunk, this._session);
  }

  private _onPortError(port: string, error: Error) {
    PluginIPCService.sendToPluginHost(this._session, {
      event: ERenderEvents.error,
      streamId: this._session,
      error: error.message,
      port: port,
    }).catch((error: Error) => {
      this._logger.error(
        `Failed to notify host about port error on ${port} due error: ${error.message}`
      );
    });
    this._logger.error(`Port "${port}" return error: ${error.message}`);
    // We can remove port, because on error it will be destroyed
    this._removePort(port);
  }

  private _onPortDisconnect(port: string) {
    PluginIPCService.sendToPluginHost(this._session, {
      event: ERenderEvents.disconnected,
      streamId: this._session,
      port: port,
    }).catch((error: Error) => {
      this._logger.error(
        `Failed to notify host about port disconnection on ${port} due error: ${error.message}`
      );
    });
    this._logger.error(`Port "${port}" is disconnected`);
    // We can remove port, because on disconnect it will be destroyed
    this._removePort(port);
  }

  private _onSpyPortDisconnect(port: string) {
    this._logger.error(`Port "${port}" is disconnected`);
    this._removePort(port);
  }

  private _removePort(port: string) {
    const index: number = this._ports.indexOf(port);
    if (index === -1) {
      return;
    }
    this._ports.splice(index, 1);
  }

  private _isPortRefed(port: string): boolean {
    return this._ports.indexOf(port) !== -1;
  }
}
