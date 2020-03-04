import Logger from './env/env.logger';
import ServicePorts from './services/service.sessions';
import { ServiceState } from 'chipmunk.plugin.ipc';
import { test } from './test';

// test();

class Plugin {

    private _logger: Logger = new Logger('SerialPorts');

    constructor() {
        this._logger.env(`Plugin is executed`);
        process.once('beforeExit', this._beforeProcessExit.bind(this));
    }

    private _beforeProcessExit() {
        ServicePorts.destroy();
    }

}

const app: Plugin = new Plugin();

// Notify core about plugin
ServiceState.accept().catch((err: Error) => {
    console.log(`Fail to notify core about plugin due error: ${err.message}`);
});
