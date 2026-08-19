export interface JsonRpcRequest<TParams> {
   jsonrpc: '2.0';
   id: string | number;
   method: string;
   params: TParams;
}

export interface JsonRpcResponse<TResult> {
   jsonrpc: '2.0';
   id: string | number;
   result?: TResult;
   error?: {
      code: string | number;
      message: string;
      data?: any;
   };
}

export interface IpakResultWrapper<T> {
   id?: string;
   data: T;
}

export interface ContractCreateRequestParams {
   client_id: string;
   client_info?: Record<string, any>;
   redirects: {
      successUrl: string;
      failUrl: string;
   };
}

export interface ContractCreateResultData {
   url_to_add_card: string;
   contract_id: string;
}

export interface ContractGetRequestParams {
   contract_id: string;
}

export interface ContractGetResultData {
   contract_id: string;
   client_id: string;
   status: string;
   card: {
      pan_masked: string;
      expiry: string;
   };
}

export interface PaymentPayRequestParams {
   contract_id: string;
   order_id: string;
   amount: number;
   ofdInfo: OfdInfo;
   taxInfo?: Record<any, any>;
}

export interface PaymentPayResultData {
   code: number;
   transfer_id: string;
   order_id: string;
   message: string;
   ofd_link?: string;
}

export interface PaymentGetRequestParams {
   contract_id: string;
   transfer_id: string;
}

export interface PaymentGetResultData {
   status: string;
   amount: number;
   transfer_id?: string;
   message?: string;
   resolution?: string;
}

export interface PaymentCancelRequestParams {
   contract_id: string;
   transfer_id: string;
}

export interface PaymentCancelResultData {
   code: number;
   transfer_id: string;
   amount: number;
   message: string;
}

export interface ContractCancelRequestParams {
   contract_id: string;
}

export interface ContractCancelResultData {
   contract_id: string;
   client_id: string;
   status: string;
   card: {
      pan_masked: string;
      expiry: string;
   };
}

export interface OfdItem {
   Name: string; // Название товара
   SPIC: string; // ИКПУ код (17 цифр)
   PackageCode: string; // Код упаковки
   price: number; // Цена за единицу (в сумах)
   count: number; // Количество
   VATPercent: number; // НДС (например, 0 или 12)
   Discount?: number; // Скидка (необязательно)
}

export interface OfdInfo {
   ReceiptType: number; // 0 - продажа/возврат
   Items: OfdItem[];
}
