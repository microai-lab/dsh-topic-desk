/**
 * 外部插件工作区的 Typert 元类型桥接。
 *
 * rc.1 生成器只识别同一工作区内由官方包名声明的 Remote 元类型；运行时实现仍由
 * 官方 rc.2 包提供。该私有包不会随 Topic Desk 发布。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { TypertGatewayBindingOptions } from '@deepseek-ai/dsh-typert-protocol-runtime'
import {
  Remote as RuntimeRemote,
  TypertRemoteService as RuntimeTypertRemoteService,
} from '@deepseek-ai/dsh-typert-protocol-runtime'

export * from '@deepseek-ai/dsh-typert-protocol-runtime'

/** 构建期可识别、运行时透传到官方协议包的 Remote 装饰器。 */
export declare const Remote: typeof RuntimeRemote

/** 构建期可识别、运行时继承官方协议实现的 Remote 服务基类。 */
export declare abstract class TypertRemoteService<out T = never> extends RuntimeTypertRemoteService<T> {
  protected constructor(ctx: Context, serviceKey: string, options?: TypertGatewayBindingOptions)
}
