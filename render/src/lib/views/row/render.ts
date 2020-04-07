import * as Toolkit from 'chipmunk.client.toolkit';
import { SerialPortRowRenderAPI } from './render.api';

export const CPluginName = 'chipmunk-serial-plugin';

export class SerialPortRowRender extends Toolkit.TypedRowRender<SerialPortRowRenderAPI> {

    private _api: SerialPortRowRenderAPI = new SerialPortRowRenderAPI();

    constructor() {
        super();
    }

    public getType(): Toolkit.ETypedRowRenders {
        return Toolkit.ETypedRowRenders.external;
    }

    public isTypeMatch(sourceName: string): boolean {
        return sourceName === CPluginName;
    }

    public getAPI(): SerialPortRowRenderAPI {
        return this._api;
    }

}
